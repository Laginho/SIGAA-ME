# BUG-013: navegação pós-sync é disparada e esquecida, e puxa o usuário de volta
Status: resolved
Stage: done
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

#### Resolution (2026-09-13)

Aprovada sem mudança de código na revisão. PR #22, commits `2436e68` (teste) e
`781d036` (correção).

**Decisão.** O timer virou estado de módulo (`postSyncTimer`) com
`schedulePostSyncNavigation` / `cancelPostSyncNavigation`, cancelado no
`hashchange`. O roteador é hash-only (`main.ts:13-44`), então `hashchange` é o
sinal de desmontagem desta tela — não é um gancho só do teste. Mesmo padrão do
`stopLoadingInterval` no `loading.ts` (`CLEAN-004`), como o ticket pedia.

**Arquivos.** `src/pages/sync-selection.ts` (+23/-1),
`tests/unit/sync-selection.test.ts` (+28/-1). Nada fora dos Primary files. O
`diff --stat` confirma a separação: o commit de teste não toca `src/`, o de
código não toca teste.

**Vermelho.** Com `src/pages/sync-selection.ts` restaurado do `master`:

    AssertionError: expected 1 to be +0
    ❯ tests/unit/sync-selection.test.ts:344  expect(vi.getTimerCount()).toBe(0)
    Tests  1 failed | 13 passed (14)

Falha pelo motivo certo — o timer sobrevive à troca de rota.

**Gate** (`npm run quality`, Windows): typecheck limpo, ESLint 0 errors / 55
warnings (todos `no-explicit-any` pré-existentes), `60 passed (60)` arquivos,
`689 passed | 5 skipped (694)`. CI do PR verde nos três jobs.

**Critérios.** 1 ✅ 2 ✅ 3 ✅.

**Nota.** O workaround do `QA-008` (`flushMicrotasks` no describe `:235`)
continua necessário: o vazamento de lá vem de um teste de sync bem-sucedido
terminar com o timer pendente, e nada no arquivo dispara `hashchange` de forma
determinística para cancelá-lo. Esta correção é de produção, não de isolamento
de teste.

