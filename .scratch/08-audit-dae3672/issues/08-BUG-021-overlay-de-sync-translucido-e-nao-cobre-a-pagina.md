# BUG-021: Overlay de sync é translúcido e não cobre a página inteira
Status: resolved
Stage: done
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

#### Resolution (2026-09-17)

Verdict: Approve

`.sync-progress-overlay` passou a `position: fixed; inset: 0; opacity: 1`, sem
`backdrop-filter` (`src/styles/sync-selection.css:145-156`), e o comentário
obsoleto acima da regra virou uma linha que diz por que é `fixed`. Teste novo em
`tests/e2e/accessibility.spec.ts:231`, no commit próprio `e95d29e`; correção em
`fde58e8`. PR #45, merge `ce2a440`.

Nenhum ancestral do overlay cria bloco contentor para `fixed`: `body` e `#app`
(`main.css:83-97`) não têm `transform`/`filter`/`perspective`, e o único
`perspective` do arquivo está em `.sync-cards-container` (`sync-selection.css:56`),
irmão do overlay e não ancestral.

Vermelho/verde, provado com o bundle reconstruído (`npx playwright test` sozinho
roda contra o `dist` antigo e dá falso verde — a prova exige `npx vite build`
antes, como o script `test:e2e` faz):

- Com o CSS anterior: `1 failed` — `expect(position).toBe('fixed')` recebeu
  `absolute`. Sondagem no mesmo build mostrou que a página rola de verdade
  (`scrollY: 123`, `scrollHeight: 643`, `clientHeight: 520`), a caixa do overlay
  fica em `top: -123` e os dois cantos inferiores do viewport **não** atingem o
  overlay — o critério 3 é vermelho por si só, não só pela ordem das asserções.
- Com a correção: `19 passed (17.8s)` em `npm run test:e2e -- accessibility`,
  os cinco pontos atingindo o overlay.

Critérios: 1 ✅, 2 ✅ no essencial (o teste afirma `position`/`opacity` computados
e cobertura por `elementFromPoint`, mais forte que a igualdade de `boundingBox`,
mas roda num tema só — `.sync-progress-overlay` tem uma única regra em todo o
`src/`, sem sobrescrita por `[data-theme]`, e os dois `--color-background`
(`main.css:6` e `:24`) são hex opacos, então os valores não variam por tema),
3 ✅, 4 ✅ (801 passed | 5 skipped; os cinco testes unitários do overlay intactos),
5 ✅ (`npm run quality` verde, 0 erros de lint e 40 warnings `no-explicit-any`
pré-existentes).

Duas observações sem ação, nenhuma bloqueante:

- O `afterEach` do describe novo faz `removeHandler('get-courses')` sem restaurar
  o handler real. Hoje é inofensivo — nenhum teste posterior do arquivo invoca
  esse canal —, mas um teste futuro que clique em sync depois deste describe vai
  falhar sem apontar para cá.
- O overlay cobre visualmente e não torna o resto da página inerte: durante o
  sync o Tab ainda alcança os `.sync-card` atrás dele. É anterior a este ticket e
  fora dos Primary files.
