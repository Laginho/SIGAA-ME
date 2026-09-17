# BUG-021: Overlay de sync é translúcido e não cobre a página inteira
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/styles/sync-selection.css` (`.sync-progress-overlay`, `:146-161`)
  - `tests/e2e/accessibility.spec.ts` (novo describe para a tela de sync)

Reportado por Bruno em 2026-09-17 com screenshot: durante o sync, os três
cards (Rápido / Completo / Backup) aparecem por baixo do overlay, e a parte
de baixo dos cards fica totalmente visível abaixo dele. Não vem da auditoria
`dae3672`.

#### What to build

Dois defeitos, ambos em `.sync-progress-overlay`:

1. **Translúcido.** `opacity: 0.98` no elemento inteiro deixa passar o fundo,
   e `backdrop-filter: blur(5px)` desfoca o que passa em vez de esconder.
   O `background: var(--color-background)` já é opaco; a opacidade é o que
   estraga.
2. **Não cobre a página.** `position: absolute` com `top/left/right/bottom: 0`
   e nenhum ancestral posicionado: o bloco contentor é o inicial, do tamanho
   do viewport, não da página. `.sync-selection-container` tem `height: 100vh`
   mais margens, então a página rola (a barra de rolagem está no screenshot);
   o overlay cobre só a primeira altura de viewport e o que está abaixo fica
   descoberto.

Correção: `position: fixed; inset: 0; opacity: 1` (ou remover `opacity`),
remover `backdrop-filter`. `fixed` cobre o viewport independente de rolagem
e o fundo opaco torna o blur inútil. Manter `z-index: 10`, flex e a
`transition` (o `showError` não anima opacidade, mas não custa).

Não mexer no `.sync-selection-container` nem em `#app`.

#### Acceptance criteria

1. `.sync-progress-overlay` declara `position: fixed`, `inset: 0` e nenhuma
   `opacity` menor que 1, nem `backdrop-filter`.
2. Com o overlay aberto, `getComputedStyle` devolve `position: fixed`,
   `opacity: 1`, e o `boundingBox` do overlay é igual ao viewport, nos dois
   temas.
3. Com a janela rolada até o fim (`window.scrollTo(0, document.body.scrollHeight)`),
   o overlay continua cobrindo o viewport: `elementFromPoint` no centro e nos
   quatro cantos do viewport devolve o overlay ou um descendente dele, nunca
   um `.sync-card`.
4. Os cinco testes de `tests/unit/sync-selection.test.ts` que consultam
   `.sync-progress-overlay` continuam verdes sem alteração.
5. `npm run quality` verde e `npm run test:e2e -- accessibility` verde.

#### Verification

    npm run quality
    npx tsc --noEmit; if ($?) { npx vite build }
    npm run test:e2e -- accessibility

## Tests stage 2 writes (own commit, red)

- `tests/e2e/accessibility.spec.ts`, novo describe `Overlay de sync`: plantar
  a fixture de sessão como o `visual.spec.ts` faz, navegar para `#/sync-selection`,
  mockar `window.api.getCourses` com uma Promise que nunca resolve
  (como o teste unitário "shows the progress overlay" faz), clicar em
  `#btnFastSync`, rolar até o fim e afirmar os critérios 2 e 3 num único
  `evaluate`. Vermelho hoje: `position` é `absolute`, `opacity` é `0.98`, e
  `elementFromPoint` no canto inferior devolve um card.
- Layout e opacidade computada não são pináveis por vitest sem espelhar o
  CSS, então o teste é E2E, como no `BUG-020`.

## Comments

- O comentário acima da regra (`sync-selection.css:142-145`) é um monólogo
  sobre tema claro vs. escuro e não diz nada sobre cobertura. Trocar por uma
  linha que diga por que é `fixed` (a página rola).

- 2026-09-17 Attempt 1 failed: exit 0. Log tail: BUG-021 is already closed — no work to do. /  / - Ticket state on `master`: `Stage: done`, `Status: resolved` (ledger row `2026-09-17 | BUG-021 | ce2a440`). / - Fixed via PR #45 (branch `bug-021`, merged `ce2a440`): `.sync-progress-overlay` changed from `position: absolute` + `opacity: 0.98` + `backdrop-filter: blur(5px)` to `position: fixed; inset: 0; opacity: 1`, no blur. / - Verification recorded: 19/19 accessibility e2e green, `npm run quality` green (801 passed, 5 skipped), red/green proof rebuilt against a fresh `vite build`. / - Two non-blocking notes left in the ticket, no action: an `afterEach` that doesn't restore a removed IPC handler, and the overlay not making the page behind it inert (pre-existing, out of scope). /  / Your current branch (`sweatshop/2026-09-17-1301`) hasn't picked up master's commits yet, so the checked-out copy of the ticket still shows the pristine `to-implement` version — that's just staleness, not a real reopening. Nothing for this session to act on. /
