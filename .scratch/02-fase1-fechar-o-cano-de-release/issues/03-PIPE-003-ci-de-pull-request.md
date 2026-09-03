# PIPE-003 — CI de pull request
Status: resolved
Priority: P0
Tracker status at migration: `DONE` — implementado na sessão 2026-08-05

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P0`
- Owner: Claude
- Dependencies: `PIPE-002`
- Primary files: `.github/workflows/quality.yml` (o nome ficou `quality`, não
  `ci`)

#### Problem

Não existe CI para PR. O único workflow tem triggers `workflow_dispatch` e push
de tag. Nenhum PR jamais foi verificado.

#### Acceptance criteria

- Abrir PR dispara `npm run quality`.
- Não requer credenciais do SIGAA — só testes determinísticos.
- Um PR com teste quebrado mostra falha visível.

#### Implementation notes (2026-08-05)

`quality.yml` roda em `push` de qualquer branch, em `pull_request` e por
`workflow_dispatch`, com `concurrency` cancelando execução anterior do mesmo
branch. Dois jobs:

- `gate` — `windows-latest`, typecheck → lint → testes, em passos separados para
  que a aba do Actions diga **qual** falhou.
- `e2e` — os specs de Playwright que não precisam de credencial, com
  `continue-on-error: true` e upload de `playwright-report/`,
  `test-results/` e `_agent_tmp/shots/`. Não bloqueia o gate: se o Electron não
  subir no runner, o resultado do typecheck/lint/testes continua legível.

Por que `windows-latest` e não `ubuntu`: é a plataforma do autor e a que baixa os
binários nativos que o app usa de verdade. Rodar o gate num Linux verificaria
uma árvore de dependências que ninguém executa.

Sem credencial no ambiente, os 3 testes de login real entram em skip pelo
`describeOrSkip`. É intencional — credencial de portal universitário não vai para
secret de CI, e o CI não deve logar na conta de ninguém a cada push.

**Ressalva registrada no próprio YAML:** o passo de instalação usa
`npm install`, não `npm ci`, por causa do `DEP-002`. O CI existe e roda; o que
ele não é ainda é **reproduzível** — ele resolve versões por conta própria em vez
de instalar o que o lock descreve.

**Follow-up 2026-08-09:** ressalva resolvida. O `DEP-002` alinhou Vite/Vitest,
regenerou o lock e trocou os passos para `npm ci`. O `PIPE-005` tornou o E2E
bloqueante e o `PIPE-006` adicionou o terceiro job, de scanner de segredo.
