# CLEAN-015: leg empacotada do `DEV-001` ficou sem entrada adversarial de argv
Status: resolved
Stage: done
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `tests/integration/dev-cache-mutation-boundary.test.ts` (`:111`, `:138`, `:169`, `:176-182`)

Saída (a) da decisão pendente registrada em `## Comments` do `CLEAN-014`,
escolhida em 2026-09-18 na revisão do PR #49.

#### What to build

`CLEAN-014` removeu `additionalArguments: ['--sigaa-dev']` do `main.ts`. Com
isso `bootMain` devolve `[]` para `devArgs` e `productionArgs`, e a leg 3 do
teste de fronteira (`loadPreload([...productionArgs, ...devArgs])`) passou a ser
idêntica à leg 2: prova que um argv vazio não expõe `testApi`, o que nada
afirma. Uma regressão do preload para `env === '1' || argv.includes('--sigaa-dev')`
passa a suíte inteira hoje.

A entrada adversarial tem que vir do próprio teste: alimentar a leg empacotada
com o token literal `--sigaa-dev` e retirar as afirmações que hoje falam sobre
`[]`. Nada muda em `electron/`; o main continua sem injetar flag alguma.

#### Acceptance criteria

1. A leg empacotada carrega o preload com `--sigaa-dev` presente em
   `process.argv` (literal no teste, não lido do main) e afirma que `testApi`
   não é exposto, que o cache não muda e que `syncNow` não é chamado.
2. `expect(productionArgs).not.toContain('--sigaa-dev')` (`:169`) sai: afirma
   sobre um array que o main não preenche mais. O título de `:138` e o
   `process.argv` de `:111` descrevem o que a leg exercita de fato.
3. Prova de regressão registrada na Resolution: com o preload alterado
   localmente para aceitar `argv.includes('--sigaa-dev')`, a leg empacotada
   fica vermelha; revertido, verde. Nenhum outro `expect` do arquivo muda.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/integration/dev-cache-mutation-boundary.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Não há teste novo nem commit vermelho: o ticket edita só um arquivo de teste.
  O vermelho exigido é o do critério 3, mostrado contra uma alteração local do
  preload que não é commitada.

#### Resolution (2026-09-18)

Verdict: Approve

Decisão: saída (a) da decisão pendente do `CLEAN-014`, como o ticket pede — a
leg empacotada do teste do `DEV-001` recebe o token literal `--sigaa-dev` do
próprio teste, e o main continua sem injetar flag alguma. `electron/` intocado.
Mesclada na branch de sessão `sweatshop/2026-09-18-1255` em `5ad920e`
(`--no-ff`). Rebase sem efeito: a ponta da sessão (`5c98dfd`) é a base da
branch, e a árvore do merge é idêntica à de `15a4052`.

Arquivos: `tests/integration/dev-cache-mutation-boundary.test.ts` (+7/-6:
`:111-112` argv do main sem a flag, com comentário; `:139` título; `:169`
`expect` removido; `:177-180` comentário e
`loadPreload([...productionArgs, '--sigaa-dev'])`), este ticket.

Commits: `15a4052` (etapa 2, único; toca só o arquivo de teste e este ticket).
Sem commit vermelho separado, como "Tests stage 2 writes" manda: o vermelho do
critério 3 é contra uma regressão local do preload, não commitada.

Prova vermelho-verde, refeita pela revisão em 2026-09-18 com `preload.ts:78`
alterado localmente para `=== '1' || process.argv.includes('--sigaa-dev')`:

- teste de `15a4052` contra a regressão: `Tests 2 failed | 2 passed (4)`, os
  dois em `:181:57` (`AssertionError: expected true to be false` — `testApi`
  exposto na leg empacotada);
- teste da base (`master:tests/integration/dev-cache-mutation-boundary.test.ts`)
  contra a mesma regressão: `4 passed (4)` — a suíte anterior não pegava, que é
  a premissa do ticket;
- preload restaurado (`git checkout -- electron/preload.ts`), teste de
  `15a4052`: `4 passed (4)`. Árvore limpa depois.

Gate `npm run quality` (2026-09-18, em `15a4052`, mesma árvore do merge):
typecheck limpo; ESLint 0 erros, 40 warnings (`no-explicit-any` legado, os
mesmos 40 do `CLEAN-014`); vitest `Test Files 72 passed (72)`,
`Tests 806 passed | 5 skipped (811)`.

Critérios: 1 ✅ (`:180` monta `process.argv = ['electron-renderer',
...productionArgs, '--sigaa-dev']`; `:181-183` afirmam `testApi` ausente, cache
igual a `cacheBefore`, `syncNow` não chamado), 2 ✅ (`:169` saiu; `:139` e
`:111-112` descrevem a leg — `main.ts` só lê `--user-data-dir=` (`:24`) e
`--hidden` (`:136`) do argv, e decide o bridge por `app.isPackaged` em
`:143-147`, via `process.env`), 3 ✅ (prova acima; hunk a hunk, o único
`expect` que muda é o removido em `:169`, o bloco `BUG-012` inclusive idêntico
à base), 4 ✅.

Achados (Standards e Spec, dois agentes cegos): nenhuma violação das regras
1–7 do `CLAUDE.md`, nenhum smell da baseline, nada fora dos Primary files;
commit em Conventional Commits com corpo casando com o diff. Os dois convergem
na mesma nota, sem defeito: o critério 3 pede a prova "na Resolution", e a
etapa 2 a registrou sob `## Comments`, que é o lugar certo pelo
`orchestration.md` ("Registro na issue" reserva o bloco Resolution para a
revisão); este bloco a incorpora, refeita. Para a etapa 1: critério que pede
registro deve dizer "em `## Comments`; a revisão copia para a Resolution".

## Comments

- 2026-09-18, stage 2: prova do critério 3 feita localmente, sem commit. Com
  `preload.ts:78` alterado para `=== '1' || process.argv.includes('--sigaa-dev')`,
  `npx vitest run tests/integration/dev-cache-mutation-boundary.test.ts` deu
  `2 failed | 2 passed (4)`, ambos em `:181` (`expected true to be false`, o
  `testApi` da leg empacotada). Preload revertido: `4 passed (4)`. Gate:
  72 arquivos, 806 passed | 5 skipped.
