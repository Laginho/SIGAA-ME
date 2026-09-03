# QA-006 — Teste de download escrevia no filesystem real
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado e verificado em 2026-08-09

- Owner: Codex
- Dependencies: none
- Primary files: `tests/unit/sigaa-service.test.ts`

#### Problem

Os testes de `SigaaService.downloadFile()` passavam `/mock/downloads` como
`basePath`, mas não mockavam o módulo `fs`. O serviço executava `existsSync` e
`mkdirSync` de verdade antes do download: no Windows o caminho era criado em
`C:\mock\downloads`, enquanto num sistema POSIX sem acesso à raiz os testes
falhavam com `EACCES` antes das asserções relevantes.

#### Fix

O teste agora mocka `fs` antes de importar o serviço. `existsSync` retorna
`false` e `mkdirSync` é inerte. O retorno `false` mantém o cenário padrão de
arquivo ainda não baixado e evita que testes futuros de download em lote pulem
o caminho exercitado.

#### Acceptance criteria

- `npx vitest run` produz 64 passed / 4 skipped no Windows e no Linux.
- Nenhum teste de unidade ou integração escreve no filesystem real; os specs de
  E2E apagam `.test-user-data` de propósito, e devem.
- `electron/services/sigaa.service.ts` permanece inalterado.

#### Verification

- Linux, medido pelo Claude antes da implementação: 10 arquivos, 64 passed / 4
  skipped.
- Windows, medido pelo Codex depois da implementação: 10 arquivos, 64 passed /
  4 skipped.
- `rg -n "mkdirSync|writeFileSync" tests` encontrou quatro ocorrências, todas
  em mocks de unidade ou integração. Essa busca não cobre `rmSync`: os três
  usos em `tests/e2e/` removem `.test-user-data` deliberadamente.

#### Implementation notes

- Commit: `f93b2a5`
- Divergências da especificação: nenhuma.
