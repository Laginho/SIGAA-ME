# A11Y-004: Overlay de sync não torna a página atrás dele inerte
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/sync-selection.ts` (`startSync`, `:139`–`:195`)

Levantado pelo revisor do `BUG-021` (2026-09-17) como nota não bloqueante, e
confirmado: o problema é anterior ao `BUG-021` e não foi introduzido por ele.
O `BUG-021` tornou o overlay opaco e `position: fixed`, então ele agora cobre
a viewport inteira visualmente — mas só visualmente. O conteúdo atrás dele
continua na ordem de foco: durante o sync, `Tab` alcança os botões dos cards
de disciplina que o usuário não consegue ver.

#### What to build

Marcar o conteúdo existente de `app` como `inert` enquanto o overlay vive, e
desmarcar quando ele sai. O atributo é nativo e o Chromium do Electron 41
suporta; não precisa de biblioteca de focus trap nem de mexer em `tabindex`
elemento por elemento.

Os filhos de `app` que existem antes do `app.appendChild(overlay)` (`:155`)
são o que fica inerte; o overlay é appendado depois, então não se marca a si
mesmo. Reverter em `overlay.remove()` (`:195`) — e em qualquer outro caminho
de saída do overlay, se houver mais de um.

#### Acceptance criteria

1. Com o overlay montado, todo filho de `app` que não seja o overlay tem o
   atributo `inert`.
2. Depois de `overlay.remove()`, nenhum filho de `app` tem `inert`.
3. `npm run quality` verde.

#### Verification

    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sync-selection.test.ts`: um teste que monta o overlay e afirma
  o critério 1, outro que o remove e afirma o critério 2. O arquivo já monta
  e inspeciona o overlay em cinco testes (`:127`, `:141`, `:230`, `:268`,
  `:349`); seguir o mesmo padrão.

## Comments

- Aberta por pedido do Bruno em 2026-09-17, a partir da oferta do revisor do
  `BUG-021`. A outra nota daquela revisão — o `afterEach` que remove o handler
  `get-courses` sem restaurá-lo — não virou ticket.
