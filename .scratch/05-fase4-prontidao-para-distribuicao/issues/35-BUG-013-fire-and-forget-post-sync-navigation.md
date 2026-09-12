# BUG-013: navegação pós-sync é disparada e esquecida, e puxa o usuário de volta
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum

- Primary files:
  - `src/pages/sync-selection.ts` (só o `setTimeout` de `:245` e o que for
    preciso para cancelá-lo)
  - `tests/unit/sync-selection.test.ts` (teste novo; não mexa nos laços de
    espera do describe `:235`, são do `QA-008`)

Aberto pela revisão do `QA-008` (2026-09-11), que provou a causa e deixou o
conserto fora de escopo por escrito: "Se for consertar, ticket próprio — não
amplie este."

#### What to build

Depois de um sync bem-sucedido, `sync-selection.ts:245` faz

    setTimeout(() => { window.location.hash = '#/dashboard'; }, 600);

sem guardar o handle. Quem sai da tela dentro desses 600ms é puxado de volta
para o dashboard. O mesmo timer sem dono é o que tornou possível o vazamento
entre testes do `QA-008` — lá foi contornado no teste, a origem continua aqui.

Guardar o handle e cancelá-lo quando a página sai de cena. O padrão já existe
no repo: `src/pages/loading.ts` virou estado de módulo com
`stopLoadingInterval()` no `CLEAN-004`.

#### Acceptance criteria

1. A navegação pós-sync não acontece se o usuário mudou de rota dentro dos
   600ms.
2. Não fica timer pendente da tela de sync depois que ela é desmontada.
3. O fluxo feliz continua igual: sync bem-sucedido sem interação vai para
   `#/dashboard`.

#### Verification

    npx vitest run tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sync-selection.test.ts`: depois de um sync bem-sucedido,
  desmontar/trocar de rota e afirmar que nenhum timer pendente resta e que o
  hash não vira `#/dashboard`. Vermelho hoje porque nada cancela o timer.

## Comments

