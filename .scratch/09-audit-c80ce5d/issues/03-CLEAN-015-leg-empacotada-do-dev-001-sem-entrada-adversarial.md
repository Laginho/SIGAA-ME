# CLEAN-015: leg empacotada do `DEV-001` ficou sem entrada adversarial de argv
Status: open
Stage: to-implement
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

## Comments
