# DL-004: Identidade por id no caminho de download
Status: open
Stage: to-implement
Priority: P1
Blocked by: DL-003

- Primary files:
  - `electron/services/sigaa.service.ts` (`_downloadAllFilesInternal`: pareamento em `:498`, `:523`, `:561`; dedup `:357`)
  - `electron/services/file-validation.service.ts` (`finalizeDownload`, o `rename` final `:231`)
  - `shared/domain.ts` (`DownloadRecord`, `:83`)
  - `shared/ipc.ts` (`DownloadProgress`, `:62`)
  - `electron/services/download.service.ts` (dedup por `file.name` em `downloadCourseFiles`, `:332-346` — só se ainda existir; ver `CLEAN-003`)
  - `src/pages/course-detail.ts` (cache `downloadedFiles` e casamento do botão de progresso, `:277`, `:300`, `:340`, `:388`)
  - `tests/integration/audit-download-disk.test.ts` (acrescentar o `it.each` de colisão)
  - New: `tests/unit/audit-download-identity.test.ts`

Achados Broken #2 e #3 de `docs/audits/2026-09-09-40a0d01.md`, passos 2 e 3 da
ordem recomendada. Mesma raiz (pareamento por nome em vez de id); separar
faria dois tickets consertarem metade do mesmo bug.

#### What to build

Dois arquivos com o mesmo nome (ou nomes que sanitizam para o mesmo nome) no
mesmo lote são baixados, validados, gravados e reportados como dois arquivos.
Hoje:

- retry e fallback pareiam `results` com `files` por `name`; com nomes
  repetidos rebaixam o arquivo errado e marcam o registro errado;
- `finalizeDownload` termina em `fs.promises.rename(partPath, filePath)`, que
  sobrescreve em silêncio: um só arquivo fica no disco, com sucesso para os
  dois.

Já encaminhado no master: `CourseFile.id` e `DownloadToken` existem no pedido;
`findScript` (`sigaa.service.ts:44-53`) seleciona o script por id. O que falta
é o resto da cadeia carregar o id.

#### Acceptance criteria

1. Com dois `DownloadFileRef` de mesmo `name` e ids distintos, onde o segundo
   falha no HTTP e é recuperado no retry (ou no fallback Playwright), toda
   chamada de retry a `httpScraper.downloadFile` recebe o **id do segundo**,
   e o fallback recebe o **script do segundo**. `results` reporta os dois
   como `downloaded`, cada um com o seu `filePath`.
2. `DownloadRecord` e `DownloadProgress` carregam `fileId` além de
   `fileName`. O renderer casa botão e cache por `fileId`; nenhum
   `find(... .name === ...)` sobra em `sigaa.service.ts` para parear
   resultado com pedido.
3. Dois downloads reais (`HttpScraperService.downloadFile`, fixture) com nomes
   que colidem — `same.txt`/`same.txt`, `Lista:1.txt`/`Lista/1.txt`, e dois
   nomes com 151+ caracteres que truncam igual — deixam **dois** arquivos no
   destino, cada um com o próprio conteúdo, e os dois `filePath` retornados
   apontam para arquivos distintos.
4. O caminho final é exclusivo: em `EEXIST` o nome recebe sufixo numerado
   (` (1)`, ` (2)`, ...) dentro da mesma pasta, ainda contido pelo
   `isInsideRoot`. Nunca sobrescreve um arquivo existente que não seja o
   próprio `.part`.
5. A deduplicação do lote (`:357`) continua pulando arquivo **já baixado e
   presente no disco**, agora chaveada por id, sem derrubar um homônimo novo.

#### Verification

    npx vitest run tests/unit/audit-download-identity.test.ts tests/integration/audit-download-disk.test.ts tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `git checkout 6aeb67c -- tests/unit/audit-download-identity.test.ts`
  (critério 1). Reprovar contra o master de hoje, não contra `40a0d01`.
- `it.each(... 'preserves both downloads for colliding names')` de
  `6aeb67c:tests/integration/audit-download-disk.test.ts`, acrescentado ao
  arquivo que `DL-003` já colheu (critérios 3 e 4).
- Critérios 2 e 5: teste novo em `audit-download-identity.test.ts` com dois
  homônimos, um já em disco — só o já baixado sai como `skipped`. Escrever do
  zero; a branch não cobre.
- Critério 2 no renderer: `tests/unit/course-detail.test.ts` já existe; se o
  seam do progresso mudar, ajustar lá. Não é Primary file: se precisar de
  mais que trocar a chave, volte para a etapa 1.

## Comments

- A branch `codex/fix-audit-2026-09-09` (`16f9e2e`) trocou o `rename` por
  `link` + `unlink` com retry de sufixo no `EEXIST`. Serve de referência de
  leitura; **não** faça cherry-pick do commit, ele mistura pins de dependência
  e docs.
- `PlaywrightLoginService.downloadAllFiles` e
  `DownloadService.downloadCourseFiles` também deduplicam por nome. São código
  morto (ver `CLEAN-003`). Se `CLEAN-003` fechar antes, tire
  `download.service.ts` dos Primary files; senão, não os conserte, só não os
  quebre no `tsc`.
- Fora de escopo: extrair o leitor de notícias de
  `playwright-login.service.ts` (1282 linhas). Ticket próprio.
