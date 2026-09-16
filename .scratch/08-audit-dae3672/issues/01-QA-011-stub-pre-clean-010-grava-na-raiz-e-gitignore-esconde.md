# QA-011: Stub pré-`CLEAN-010` grava PDF na raiz do repo a cada `npm test`, e o `.gitignore` esconde
Status: open
Stage: blocked
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `tests/integration/logging-boundary.test.ts` (o stub de
    `playwrightLogin.downloadFile`, `:240-241`, e as asserções `:250-253`)
  - `.gitignore` (`:38-44`)

Achado 1 da auditoria `docs/audits/2026-09-16-dae3672.md`, reproduzido em
2026-09-16: rodar só este arquivo criou `999/Cálculo I/Lista 3 (4).pdf` na raiz
do repositório.

#### What to build

O `CLEAN-010` tirou o parâmetro `fileUrl` de
`PlaywrightLoginService.downloadFile`. O chamador real hoje é
`SigaaService.downloadViaPlaywright` (`sigaa.service.ts:242`):

    this.playwrightLogin.downloadFile(courseId, courseName, fileName, basePath, fileId, script)

O stub do plano B em `logging-boundary.test.ts:240` ficou na assinatura antiga:

    downloadFile: vi.fn(async (_courseId: string, courseName: string, name: string, _fileUrl: string, basePath: string) =>
        new DownloadService().downloadFile(page, name, courseName, basePath, '999', DOWNLOAD_SCRIPT)),

Os argumentos escorregam uma posição: `_fileUrl` recebe o `basePath` real (o
`mkdtemp` do teste) e `basePath` recebe o `fileId`, `'999'`. O `DownloadService`
resolve `resolveDownloadTarget('999', 'Cálculo I', 'Lista 3.pdf')` relativo ao
cwd, que é a raiz do repositório. Ninguém viu porque todo parâmetro é `string`
(a chamada deslocada tipa) e porque o `.gitignore` ignora `*.pdf` no repositório
inteiro.

Duas consequências:

1. Todo `npm test` grava um arquivo novo em `999/Cálculo I/`. O sufixo `(N)` do
   `DL-004` garante que a pasta só cresce.
2. `expect(log).not.toContain(destino)` passa por vacuidade: `destino` nunca
   chega ao código sob teste. É a metade do teste que existe para provar que o
   `[Download]` não loga caminho absoluto, e ela não prova nada. Padrão
   `QA-003` do `CLAUDE.md`.

O `.gitignore:38-44` (`*.pdf *.zip *.docx *.pptx *.xlsx *.rar *.txt`) entra no
mesmo ticket porque é o que manteve isto invisível, e engoliria qualquer `.txt`
ou `.pdf` que alguém tentasse versionar. Nenhum teste grava fora de
`os.tmpdir()`; as sete linhas não protegem nada.

#### Acceptance criteria

1. O stub tem a assinatura atual, `(courseId, courseName, fileName, basePath,
   fileId, script)`, e repassa `basePath` e `fileId` para o `DownloadService`
   nas posições certas.
2. O teste afirma que o arquivo foi para `destino`: `result.data.filePath`
   começa com `destino`. Com o stub antigo, esta asserção falha.
3. As sete linhas de extensão saem do `.gitignore`. Se alguma pasta específica
   de saída de teste precisar de regra, ela é por caminho, não por extensão
   global.
4. Com o resíduo `10/` e `999/` apagado antes, `npm test` termina com
   `git status --short` vazio e sem `999/` na raiz.
5. `npm run quality` verde.

#### Verification

    Remove-Item -Recurse -Force 10, 999
    npx vitest run tests/integration/logging-boundary.test.ts
    git status --short
    Test-Path 999      # False
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/logging-boundary.test.ts`, describe `SigaaService.downloadFile
  — plano B via DownloadService`: corrigir a assinatura do stub e acrescentar
  `expect(result.data.filePath.startsWith(destino)).toBe(true)`. Aqui teste e
  correção são o mesmo arquivo, então o commit de teste é a correção inteira;
  para provar o vermelho, rode a asserção nova em cima do stub antigo antes de
  trocar a assinatura (falha: o caminho começa com `999`). O `.gitignore` vai
  no commit de implementação.

## Comments

- Resolução do `CLEAN-010` já registrou que `tsconfig.json` não inclui `tests/`,
  então erro de tipo em teste é invisível ao gate. Este ticket é o segundo
  efeito daquilo; não resolve o problema de fundo, só o sintoma.

- 2026-09-16 Attempt 1 failed: exit 0. Log tail: QA-011 is already done: master's tip (`4abbff5`) is "chore(scratch): close QA-011, approved and merged (QA-011)", merged via PR #41. Nothing to do. /

- 2026-09-16 Attempt 2 failed: exit 0; blocked after two attempts. Log tail: QA-011 is already closed — merged into `master` via PR #41 (`4abbff5`, `0bea343`, `3f68462`), confirming the ticket's own "Attempt 1 failed" note. The session branch `sweatshop/2026-09-16-1800` just hasn't rebased over it yet, so the local ticket copy still reads `Stage: to-implement`. Nothing to do here. /
