# BUG-020: Modal de notícia abre no canto superior esquerdo, não no centro
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/styles/course-detail.css` (`dialog.modal-content`, `:353-363`)
  - `tests/e2e/accessibility.spec.ts` (describe `Modal de notícia (dialog nativo)`)

Reportado por Bruno em 2026-09-16 com screenshot: o `<dialog>` da notícia
aparece colado no canto superior esquerdo da janela, com o backdrop cobrindo
o resto. Não vem da auditoria `dae3672`; o E2E visual não abre o modal e os
PNGs inspecionados não mostram o estado.

#### What to build

O `A11Y-001` trocou o modal por `<dialog>` nativo e o comentário em
`course-detail.css:350-352` diz que "o browser cuida ... da centralização".
Cuidaria: a folha do navegador dá a `dialog` `position: fixed; inset: 0;
margin: auto`, e é o `margin: auto` que centraliza. Só que `main.css:77`:

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

Regra de autor vence a folha do navegador, seletor universal incluído. O
`margin: 0` anula o `margin: auto`, e o dialog fica em `inset: 0` com margem
zero, ou seja, no canto. `dialog.modal-content` (`:353`) declara `width`,
`max-width`, `max-height`, `padding`, mas não `margin`. Está assim desde o
`A11Y-001` (2026-09-10).

Correção: `margin: auto;` em `dialog.modal-content`. Uma linha. Não mexer no
reset de `main.css`: o resto do app depende dele.

#### Acceptance criteria

1. `dialog.modal-content` declara `margin: auto`.
2. Com o modal aberto, o centro do `boundingBox` do `#newsModal` fica a no
   máximo 2 px do centro do viewport, nos dois eixos, em tema claro e escuro.
3. Nada mais muda no modal: `.modal-close` continua no canto do dialog
   (`position: absolute` relativo ao dialog), backdrop igual, `max-height:
   80vh` com rolagem interna igual.
4. `npm run quality` verde e `npm run test:e2e -- accessibility` verde
   (Playwright fica fora do gate; ver `AGENTS.md`, seção "Contraste de cor",
   para o mesmo arranjo).

#### Verification

    npm run quality
    npx tsc --noEmit; if ($?) { npx vite build }
    npm run test:e2e -- accessibility

## Tests stage 2 writes (own commit, red)

- `tests/e2e/accessibility.spec.ts`, dentro do describe `Modal de notícia
  (dialog nativo)`: abrir a primeira notícia como o teste de Escape já faz,
  ler `page.viewportSize()` e `page.locator('#newsModal').boundingBox()`, e
  afirmar `|cx - vw/2| <= 2` e `|cy - vh/2| <= 2`. Vermelho hoje: o box começa
  em `(0, 0)`. Não há como pinar layout por vitest sem espelhar o CSS, então o
  teste é E2E mesmo.

## Comments

- Nenhum ticket do `A11Y-001` ou do `QA-007` (varredura de correções pela
  metade) olhou posição: os dois checaram foco, Escape, inércia do fundo e
  contraste. O comentário do CSS afirma a centralização que o reset desfaz.
