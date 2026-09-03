# BUG-005 — Encanamento morto no payload de download
Status: claimed
Priority: P3
Tracker status at migration: `IN REVIEW` — implementado na sessão 2026-09-01; falta a verificação de download manual no app (Bruno)

- Status: `IN REVIEW` — implementado na sessão 2026-09-01; falta a verificação
  de download manual no app (Bruno)
- Priority: `P3`
- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files:
  - `shared/ipc.ts` (`DownloadFilePayload`, `DownloadAllFilesPayload`)
  - `electron/services/sigaa.service.ts:132-157` (`downloadFile`)
  - `src/pages/course-detail.ts:344-353, 427-435`

#### Problem

`fileUrl` e `downloadedFiles` fazem o caminho completo
localStorage → renderer → preload → IPC → `SigaaService`, e chegam como
`_fileUrl` / `_downloadedFiles` — o prefixo `_` existe porque
`noUnusedParameters` está ligado e eles **não são usados**.

O renderer lê e serializa o mapa de downloads a cada chamada para nada.

#### Por que não foi removido junto da tipagem da fronteira

Deliberado. A tipagem da fronteira (`PIPE-002`) já tocava 6 arquivos; remover
estes dois parâmetros toca também os call sites do renderer. Misturar as duas
coisas num diff só dificultaria a revisão — que é o mecanismo de aprendizado
combinado neste projeto. Dois commits pequenos e revisáveis valem mais que um
grande.

#### Acceptance criteria

- Os dois parâmetros somem de `shared/ipc.ts`, da assinatura de
  `SigaaService.downloadFile`/`downloadAllFiles`, do handler em `main.ts` e dos
  call sites em `course-detail.ts`.
- `npm run quality` passa.
- Download manual continua funcionando (verificação no app).

#### Implementation notes (2026-09-01)

Removidos `fileUrl` e `downloadedFiles` de `DownloadFilePayload` e
`downloadedFiles` de `DownloadAllFilesPayload`, e os parâmetros
correspondentes de `downloadFile`/`_downloadFileInternal`/`downloadAllFiles`
no `sigaa.service.ts`, do handler em `main.ts` e dos call sites. Um call site
a mais que o previsto: `background-sync.service.ts:161` passava `{}` como
`downloadedFiles` no auto-download. O renderer continua lendo
`downloadedFiles` do localStorage para a contabilidade local (marcar ✅ depois
do sucesso) — o que morreu foi só o envio pelo IPC. O parâmetro `fileUrl` de
`downloadSingleFile` saiu junto; o atributo `data-file-url` e a guarda
`(fileUrl || script)` do click handler ficaram como estavam.

Gate verde no Windows (typecheck, lint 0 erros/115 avisos, 109 passed +
4 skipped). Falta o critério de verificação no app — download manual — que é
do Bruno.
