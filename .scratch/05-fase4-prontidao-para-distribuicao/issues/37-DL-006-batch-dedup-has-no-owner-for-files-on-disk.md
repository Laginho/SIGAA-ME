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
  - Reabertura (critério 6):
    - `electron/services/background-sync.service.ts` (`:235-241`, o
      `downloadAllFiles` cujo `AppResult` é descartado; `:296-308`, onde o
      `background-sync-update` é montado)
    - `shared/ipc.ts` (`BackgroundSyncUpdate`, `:158-165`)
    - `src/pages/dashboard.ts` (`handleBackgroundSyncUpdate`, `:54-80`)
    - `src/pages/course-detail.ts` (`:466-483`, o laço que grava o índice —
      vira a função compartilhada)
    - `tests/integration/audit-background-sync-downloads.test.ts` (critério 6)
    - `tests/unit/dashboard-listener.test.ts` (rodada 2 da revisão: é onde
      `handleBackgroundSyncUpdate` já é exercitado)

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
6. (Reabertura, achado 1 da revisão de 2026-09-14.) O que o sync em background
   baixa entra no índice `downloads` do renderer, de modo que o próximo "Baixar
   todos" o pula em vez de gravar `X (1).pdf`:
   - `background-sync.service.ts` guarda o `AppResult` de `downloadAllFiles` e,
     se `success`, põe os `DownloadRecord` com `status: 'downloaded'` (só
     esses: `fileId`, `fileName`, `filePath`) num campo novo
     `downloads: { courseId, records }[]` do `BackgroundSyncUpdate`. Falha do
     download não derruba o ciclo: sem `success`, o curso simplesmente não
     entra em `downloads`.
   - `handleBackgroundSyncUpdate` (`dashboard.ts`) grava esses registros no
     índice `downloads` por conta com **a mesma função** que
     `course-detail.ts:466-483` usa hoje — extraia esse laço para
     `src/data/account-storage` (`recordDownloads(courseId, records)` ou nome
     equivalente) e chame dos dois lugares. Uma função, dois chamadores; não
     é abstração para um caso.
   - `background-sync-update` é canal main → renderer que já existe; o campo
     novo é tipado em `shared/ipc.ts`, sem `any`. Não vai ViewState, cookie
     nem URL do SIGAA — só `fileId`, `fileName`, `filePath`.
   - Passe `known` também no `downloadAllFiles` do sync **só se** o main tiver
     de onde tirá-lo sem estado novo; hoje não tem, então não passe. O
     critério é o registro depois, não o `skip` durante.

#### Tests stage 2 writes

Critério 6, em `tests/integration/audit-background-sync-downloads.test.ts`,
no mesmo molde dos `background-sync*.test.ts` existentes (mock do
`sigaaService`, `getWindow` falso capturando o `webContents.send`):

- `downloadAllFiles` mockado devolve `success: true` com um `downloaded` e um
  `skipped`: o `background-sync-update` capturado tem `downloads` com **um**
  registro, do arquivo `downloaded`, com `filePath`.
- `downloadAllFiles` mockado devolve `success: false`: o ciclo termina, o
  `background-sync-update` sai sem esse curso em `downloads`, e nada lança.
- Renderer: `recordDownloads` sobre um índice vazio e depois sobre um índice
  que já tem outro `fileId` do mesmo curso — os dois ficam, com `path` e
  `downloadedAt`. Este teste chama a função de produção em
  `src/data/account-storage`, não uma cópia.

Vermelho antes: o primeiro falha porque `downloads` não existe no payload; o
terceiro falha porque a função não existe.

#### Verification

    npx vitest run tests/unit/audit-download-identity.test.ts tests/integration/audit-download-disk.test.ts tests/integration/audit-background-sync-downloads.test.ts tests/unit/sigaa-service.test.ts
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

#### Review (2026-09-14, Opus)

Verdict: **Needs your call**. Os cinco critérios passam e a separação
teste/código está correta; o que segura o merge é um efeito do critério 2 que
nenhum critério previu — está no achado 1, e a decisão é do autor do ticket,
não do revisor.

Separação: `f17d31b` toca só `tests/` e a linha `Stage:`; `7b84709` não toca
nenhum arquivo de teste.

Red-green: em `f17d31b`, `npx vitest run tests/unit/audit-download-identity.test.ts
tests/integration/audit-download-disk.test.ts` → **8 failed | 7 passed (15)**.
Em `7b84709`, `npm run quality` → tsc limpo, ESLint **0 errors, 57 warnings**
(todos `no-explicit-any` pré-existentes), vitest **62 files, 714 passed | 5
skipped (719)**.

- ✅ 1. `audit-download-identity.test.ts`, "skips only the id with a valid
  registered path…" — com `existsSync` sempre verdadeiro e `known` só para o
  id 2, o id 1 baixa e o id 2 pula. Era o inverso.
- ✅ 2. "does not drop a new homonym…" — sem registro, `existsSync` verdadeiro
  em todo candidato não gera `skipped`; os dois baixam, e o sufixo fica com o
  `finalizeDownload`.
- ✅ 3. `isReusableDownload` (`sigaa.service.ts:76-86`) reaproveita o
  `validateHead` de verdade e rejeita antes dele o arquivo de 0 byte — o que o
  `download.service.ts:71-89` **não** faz (`validateHead(Buffer vazio, '.pdf')`
  devolve `ok`, porque `sigMatches` aceita prefixo). Divergir ali é o que o
  critério 3 pede, não um desvio.
- ✅ 4. `validation.ts:86-100` copia por allowlist, mesmo formato e mesmo teto
  (500) do campo `files`; cinco testes de parse. Zero `any` novo em
  `validation.ts`, `register-handlers.ts` ou `shared/ipc.ts`.
- ✅ 5. O teste nasce verde, e é o certo: o `unlink` já existia, faltava o
  teste. Provado por mutação — comentando
  `await descartarParcial('erro de escrita')` em
  `http-scraper.service.ts:923`, o teste fica vermelho em
  `expect(existsSync(partPath)).toBe(false)`.

Os quatro desvios declarados acima conferem e nenhum sai do limite: a validação
mora mesmo em `validation.ts`, e `known` depois de `onProgress` evita que
`background-sync.service.ts:235-240` passe a função de progresso na posição
errada.

**Achado 1 — download do sync em background vira duplicata no próximo lote
manual (não é fix pequeno).** `background-sync.service.ts:233-241` chama
`downloadAllFiles` sem `known` e **descarta o `AppResult`**; o índice
`downloads` vive só no `localStorage` do renderer
(`course-detail.ts:474-483`), e o `background-sync-update` não carrega caminho
nenhum. Então todo arquivo que o sync baixa sozinho fica no disco sem registro.
No próximo "Baixar todos", ele não tem `known`, não pula, e o `finalizeDownload`
o grava como `X (1).pdf` — o `X.pdf` original fica órfão. Antes do `DL-006` o
`existsSync` pulava. `autoDownloadUpdates` é `true` por padrão
(`persistence.service.ts:25`), então é o caminho de configuração padrão, não
um canto. Uma duplicata por arquivo, não um laço: a segunda cópia é registrada
e daí em diante pula.

Não conserto aqui porque não é fix pequeno pelos dois lados da regra: mexe em
`background-sync.service.ts` (fora dos Primary files) e pede teste novo. E a
causa não é a implementação — ela cumpre o critério 2 ao pé da letra. O buraco
é do spec: o ticket escolheu o índice do renderer e o sync em background é
exatamente o caso em que esse índice não existe. Quem decide é a etapa 1.
Opções, da mais barata à mais cara: aceitar e registrar (como já se aceitou a
perda da migração, logo acima); fazer o `background-sync` guardar os resultados
e mandá-los ao renderer; ou mover o índice para o `userData`, que é o que o
ticket descartou por custo.

**Achado 2 — `any` no renderer (nota, não reprova).** `course-detail.ts:455-456`
anota `[string, any]` duas vezes ao ler o índice do `localStorage`. O critério 4
diz "nenhum `any` novo na fronteira", e a fronteira, pelo `CLAUDE.md`, é
`preload.ts` + handlers IPC — lá não entrou nenhum. É estilo, e o arquivo já faz
isso ao redor (`:488`). Um predicado de tipo no `filter` resolveria.

**Achado 3 — leitura de cabeça agora tem três cópias (vira `CLEAN-006`).**
`readKnownHead` (`sigaa.service.ts:63-72`) é byte a byte a mesma coisa que
`readHeadSync` (`download.service.ts:22-31`), e `readHead`
(`file-validation.service.ts:88-97`) é a versão async. O cabeçalho do
`file-validation.service.ts:1-5` existe justamente porque duas cópias que
precisam concordar já quebraram este repositório. Fora dos Primary files desta
issue; parkado em `CLEAN-006`.

**Notas, sem ação:** `known` só é provado dentro de `basePath`, não dentro da
pasta da turma — um registro de outra turma sob a mesma raiz contaria. Na
prática o renderer já monta `known` por turma (`downloadedFiles[courseId]`), e
o pior caso é um `skipped` a mais. E `known` com mais de 500 itens derruba o
payload inteiro com `INVALID_REQUEST` em vez de só ignorar o índice; nada poda
esse índice, mas `files` tem o mesmo teto, então o limite é coerente.

#### Reopen (2026-09-14, etapa 1)

Achado 1 da revisão: opção 2 escolhida pelo humano — o `background-sync` manda
os registros ao renderer no `background-sync-update`. Critérios 1-5 ✅ ficam
como entregues em `f17d31b`/`7b84709`; só o critério 6 ❌ falta. O trabalho
continua nesta branch; `Stage: to-implement`. Achado 2 (`[string, any]` em
`course-detail.ts:455-456`) pode cair junto se a extração do laço passar por
ali; não é critério. Achado 3 segue em `CLEAN-006`.

#### Review (2026-09-14, Opus — rodada 2, critério 6)

Verdict: **reabrir**. O critério 6 ❌ não fecha: o código do lado do renderer
está certo, mas nada prova que ele roda, e o laço novo derruba o handler no
caso que o próprio arquivo já defende.

Separação: `3c03bae` e `96cb156` tocam só `tests/` (e a linha `Stage:`);
`e60f8b0` não toca nenhum arquivo de teste.

Red-green: em `96cb156`, `npx vitest run
tests/integration/audit-background-sync-downloads.test.ts
tests/integration/background-sync.test.ts` → **3 failed | 11 passed (14)**,
pelos motivos previstos (sem `downloads` no payload, sem `recordDownloads`).
Em `e60f8b0`, `npm run quality` → tsc limpo, ESLint **0 errors, 57 warnings**
(todos `no-explicit-any` pré-existentes), vitest **63 files, 717 passed | 5
skipped (722)**. Confere com o que o commit diz.

O que está certo e não volta a ser discutido: o `AppResult` deixou de ser
descartado; o filtro em `background-sync.service.ts:242-246` manda só os
`downloaded`, e o `DownloadRecord` dessa variante é exatamente
`fileId`/`fileName`/`filePath` + o discriminante (`shared/domain.ts:84`) — nada
de ViewState, cookie ou URL do SIGAA; falha do download não derruba o ciclo;
`downloads` é tipado em `shared/ipc.ts` sem `any`; `known` não é passado no
sync, como o ticket mandou; e `recordDownloads` tem um chamador de cada lado
(`course-detail.ts:474`, `dashboard.ts:66`), uma função e dois chamadores.

**Achado 1 — a metade do critério 6 que fecha o buraco não tem teste.**
Apagando a chamada em `dashboard.ts:66` (substituída por `void courseId; void
records;`), a suíte inteira fica verde: **63 files, 717 passed | 5 skipped**,
os mesmos números de antes. Os três testes escritos provam as duas pontas
isoladas — o main põe `downloads` no payload, e `recordDownloads` grava no
índice — e nenhum prova o fio entre elas, que é o que o critério 6 pede
("entra no índice `downloads` do renderer"). É o item 5 do "Antes de commitar"
do `CLAUDE.md`: revertida a correção, nenhum teste falha. A lista "Tests stage
2 writes" pedia exatamente esses três, e a implementação a cumpriu ao pé da
letra — o buraco é da lista, não de quem a seguiu.
Falta: um teste que chame `handleBackgroundSyncUpdate` com `downloads` no
payload e verifique o índice `downloads` da conta depois.
`tests/unit/dashboard-listener.test.ts` já monta esse cenário (conta ativa,
jsdom, `localStorage` limpo) e agora está nos Primary files.

**Achado 2 — o laço novo tira do ar o aviso de quota.** `recordDownloads`
escreve no `localStorage` sem guarda, e está **antes** do `try/catch` de
`mergeCoursesIntoCache` (`dashboard.ts:65-77`). Com a quota estourada, o
`setItem` estoura para qualquer chave: a exceção sai de
`handleBackgroundSyncUpdate`, sobe pelo `subscription` do `preload.ts:59` e
mata o ciclo antes do `toast.error` — o usuário deixa de receber o aviso que o
comentário de `:73-74` existe para garantir ("silently dropping a sync is how
stale data masquerades as fresh"), e o merge das disciplinas nem é tentado.
`tests/unit/dashboard-listener.test.ts:27-30` só não pega isso porque estreita
o throw à chave `courses`; a quota real não estreita.
Não conserto aqui: cabe nos Primary files, mas precisa de teste novo — pela
regra, volta para a etapa 2. A ordem atual (registrar antes de tudo) é decisão
defensável e não precisa mudar; o que falta é a guarda.

**Notas, sem ação:** `downloads` é opcional em `BackgroundSyncUpdate` mas o
main sempre manda (mesmo vazio) — o `?? []` do renderer cobre, e o teste de
forma em `background-sync.test.ts:167` já exige a chave. E o sync continua sem
`known`, então um download manual feito na janela entre o arquivo aparecer e o
ciclo rodar ainda pode virar `X (1).pdf`; foi decisão explícita do último
bullet do critério 6, fica registrada, não reaberta.

Critérios 1-5 seguem ✅ como em `f17d31b`/`7b84709`: os três commits desta
rodada não tocam em nada deles, e a suíte inteira passa. Falta só o critério 6,
nesta mesma branch — os dois achados são o mesmo arquivo e o mesmo laço.
