# DL-006: o lote não sabe qual id gravou o arquivo que encontra no disco
Status: open
Stage: to-review
Priority: P2
Blocked by: nenhum

- Primary files:
  - `electron/services/sigaa.service.ts` (filtro de duplicata do lote,
    `:357-393` — o `claimedPaths` e o `existsSync` que decide o `skipped`)
  - `shared/ipc.ts` (`DownloadAllFilesPayload`/`DownloadFileRef`, `:52-55`)
  - `electron/ipc/register-handlers.ts` (validação do payload novo)
  - `src/pages/course-detail.ts` (o índice que já existe, `:377-392`, e a
    chamada de `downloadAllFiles`)
  - `tests/unit/audit-download-identity.test.ts` (critérios 1-4)
  - `tests/integration/audit-download-disk.test.ts` (critério 5)

Sai da revisão do `DL-004` (achado 3, repetido nas três rodadas) e da nota da
revisão do `DL-005` de 2026-09-11. Os dois são a mesma raiz e por isso um
ticket só: o filtro do lote decide por `fs.existsSync` de um caminho
candidato, e nunca sabe **quem** gravou o arquivo que achou — nem se o que
está lá presta.

#### What to build

Dois defeitos do mesmo `filter`:

- **Atribuição por ordem.** O `claimedPaths` (entregue no `DL-004`) reserva
  candidatos na ordem do array `files`. Se o usuário já baixou só o **segundo**
  de dois homônimos, o primeiro id reivindica o nome-base, encontra no
  `existsSync` o arquivo do outro e sai `skipped` sem nunca ter baixado. É
  melhor que o master antigo (que descartava os dois) e pior que "pular o que
  já baixou".
- **Presença basta.** O `existsSync` nunca olha o conteúdo. Arquivo truncado,
  placeholder de 0 byte ou página de erro do SIGAA salva com o nome certo fica
  em disco para sempre, reportado como `skipped` a cada sincronização — o
  usuário nunca recebe o arquivo. O caminho de arquivo único já não tem esse
  buraco: `download.service.ts:70-89` roda `readHeadSync` + `validateHead`
  sobre o arquivo existente antes de reaproveitá-lo (`DL-002` + `DL-005`).

**O índice já existe, o main é que não o vê.** Depois do `DL-004` o renderer
guarda `downloads[courseId][fileId] = { downloadedAt, path }` no
`localStorage` por conta (`course-detail.ts:377-392`) — id → caminho, exatamente
o mapa que falta. Passá-lo junto no `DownloadAllFilesPayload` é mais barato que
um arquivo de persistência novo no `userData`, e não duplica estado. Decisão de
quem implementa; se for por aí, o caminho vindo do renderer é **entrada não
confiável** e cai na regra 4 do `CLAUDE.md` (validar no main), não em `as any`
nem em confiança.

#### Acceptance criteria

1. Dois homônimos no mesmo lote, ids distintos, e só o arquivo do **segundo**
   já em disco: o segundo sai `skipped`, o primeiro é **baixado** — não
   `skipped`. Hoje é o inverso.
2. Um caminho que o app nunca registrou para aquele id não basta para pular:
   arquivo de terceiro com o mesmo nome na pasta de destino não vira `skipped`;
   o download acontece e vai para o próximo sufixo livre, como o `DL-004` já
   garante no `finalizeDownload`.
3. Registro que aponta para arquivo inutilizável não vale: 0 byte, cabeça
   recusada pelo `validateHead` ou ilegível → o arquivo é rebaixado e baixado
   de novo, com a mesma decisão do `download.service.ts:70-89`. Reaproveite
   `readHeadSync`/`validateHead`; não escreva uma segunda validação.
4. O mapa que o renderer manda é validado no main antes de virar decisão:
   payload com forma errada é rejeitado pelo handler, e caminho fora do root de
   download escolhido é ignorado (o registro não conta, o arquivo é baixado).
   Nenhum `any` novo na fronteira.
5. Carry-over do `DL-003`, aberto desde 2026-09-11 e sem teste depois de três
   rodadas do `DL-004`: o descarte do `.part` no ramo `writer.on('error')`
   (`http-scraper.service.ts:920-924`) ganha um teste onde o `.part` **existe**
   quando o writer falha, e a pasta de destino termina sem ele. O teste do
   `DL-003` apaga a pasta inteira antes, então o `unlink` nunca é exercitado.

#### Verification

    npx vitest run tests/unit/audit-download-identity.test.ts tests/integration/audit-download-disk.test.ts tests/unit/sigaa-service.test.ts
    npm run quality

## Comments

- Fora de escopo: migrar o `downloads` antigo do `localStorage` (chaveado por
  nome antes do `DL-004`). O achado 5 da revisão do `DL-004` registra a perda —
  única, não recorrente — e a decisão foi aceitá-la.
- Não vale trocar o `existsSync` por leitura de conteúdo **de todos** os
  arquivos do lote: um `readHeadSync` por arquivo já registrado é o teto, e só
  para quem tem registro. Sem hash, sem varredura de pasta.
- `PlaywrightLoginService.downloadAllFiles` e
  `DownloadService.downloadCourseFiles` deduplicam por nome e continuam mortos
  (`CLEAN-003`). Não conserte, só não quebre o `tsc`.
- Dois desvios do que os Primary files diziam ao pé da letra, ambos para não
  quebrar teste fora do escopo desta issue:
  - `electron/ipc/validation.ts` também foi editado — é onde
    `parseDownloadAllFilesPayload` de fato mora; `register-handlers.ts` só
    chama a função. Tratei os dois como a mesma fronteira.
  - `known` no filtro do lote fica fora de `basePath` **ignorado dentro de
    `sigaa.service.ts`**, não filtrado em `register-handlers.ts` antes de
    chamar o serviço. Só assim o critério 4 (path fora da raiz) fica
    testável pelo mesmo seam de `SigaaService.downloadAllFiles` que os
    critérios 1-3 usam — testar via `register-handlers.ts` pediria o harness
    de `ipcMain` de `tests/unit/ipc-validation.test.ts`, um seam que a issue
    não citou. `register-handlers.ts` só repassa `req.known ?? []`.
  - `readHeadSync` não foi importado de `download.service.ts` (privado lá, e
    esse arquivo não é Primary file desta issue); `sigaa.service.ts` ganhou
    uma leitura equivalente própria (`readKnownHead`) e reaproveita
    `validateHead` de verdade, que é o que o critério 3 pede para não
    duplicar.
- `known` entra em `downloadAllFiles` depois de `onProgress`, não antes:
  `background-sync.service.ts` e `tests/unit/sigaa-service.test.ts` chamam
  esse método com até 5 argumentos posicionais e não são Primary files desta
  issue. Inserir no meio teria virado `known` recebendo a função de
  progresso por engano.
