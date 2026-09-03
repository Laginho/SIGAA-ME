# ARCH-001 — Shared domain models and IPC result contracts
Status: claimed
Priority: P0
Tracker status at migration: `NOT STARTED`

- Owner: Claude (sessão 2026-09-03)
- Dependencies: none
- Primary files:
  - New: `shared/domain.ts`
  - New: `shared/errors.ts`
  - `shared/ipc.ts` (já existia; ficou com payloads, eventos e `RendererApi` — não foi renomeado para `ipc-contracts.ts`, renomear seria churn em 5 imports sem ganho)
  - `electron/main.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/background-sync.service.ts`
  - `src/pages/{login,sync-selection,course-detail,dashboard}.ts`, `src/main.ts`
  - `tsconfig.json` já incluía `shared`; `src/vite-env.d.ts` e `electron/electron-env.d.ts` não precisaram mudar

#### Required interfaces

- `AccountId`, `AccountProfile`
- `CourseId`, `CourseSummary`, `CourseSnapshot`
- `CourseFile`, `NewsSummary`, `NewsDetail`
- `DownloadToken`, `DownloadRecord`, `DownloadResult`
- `AppResult<T>` as a discriminated success/failure union
- Stable `AppErrorCode` values for validation, session expiry, selector drift,
  cancellation, storage, downloads, and portal availability
- `RendererApi` as the only public preload contract

Renderer-facing file records must not contain JSF scripts, `onclick` content,
ViewState values, cookies, or internal SIGAA URLs.

#### Acceptance criteria

- Main, preload, and renderer import the same contract definitions. ✅
- No IPC method returns an untyped `Promise<any>`. ✅ (nem `unknown[]`; guardado por teste)
- Existing flows compile against `AppResult<T>`. ✅
- Error consumers distinguish retryable portal failures from invalid requests. ✅ — correction cycle 01 consumes `isRetryable`; only `SESSION_EXPIRED` relogs.
- `tsconfig.json` includes the shared contract directory. ✅ (já incluía)

#### Verification

```text
npm run typecheck
npm test
```

2026-09-03: `tsc` limpo; `eslint .` 0 erros (77 avisos, eram mais — o
`any` saiu de `sigaa.service`, `background-sync`, `cache.service` e dos
retornos dos parsers); `vitest run` 179 passed, 4 skipped, 183 coletados (eram 154 + 4).

#### Implementation notes (2026-09-03)

- Commit: `485bf75`
- Decisions:
  - **`AppResult<T> = { success: true; data: T } | { success: false; error: { code; message } }`.**
    Forma `data` em vez de `{ success: true } & T`: a interseção é mais curta
    nos call sites, mas quebra quando `T` tem `success` e é o tipo que alguém
    decodifica às 3 da manhã. Custo: ~20 acessos no renderer trocaram
    `result.x` por `result.data.x` e `result.message` por `result.error.message`.
  - **`DownloadToken` = `id` do arquivo no JSF (`jsfcljs(...,id,555,...)`).**
    O renderer manda `{ fileId, fileName }`; o main entra na turma, faz o parse
    da seção de arquivos e casa por id (senão por nome). Se não achar, olha o
    HTML do Dashboard — que é de onde a lista do cache saiu. Sem match em
    nenhum: `NOT_FOUND`, sem tentativa de download. Antes, o script antigo do
    renderer era o fallback; agora ele não atravessa o IPC. Isso já entrega o
    critério "JSF scripts never cross the IPC boundary" do `SEC-002` — o
    `SessionCatalogService` com tokens que expiram pode ser desnecessário, e
    a decisão fica para o `SEC-002` (o id é público, não segredo de sessão).
  - **A redução parser → domínio vive em `SigaaService`** (`toCourseSummary`,
    `toCourseFile`, `toNewsSummary`, `findScript`), porque é o único ponto por
    onde IPC e background sync passam. Os parsers exportam `ParsedFile`,
    `ParsedNews` (`http-scraper`) e `ParsedCourse` (`playwright-login`) com os
    campos crus.
  - **Classificação de erro é heurística por regex** (`classifyMessage`,
    marcada `ponytail:`), sobre as mensagens que os scrapers já emitem. A
    tabela em `tests/unit/app-result.test.ts` tem um caso por mensagem real;
    upgrade é cada origem devolver `AppError` e a função sumir.
  - **`CourseFile` não tem `url`.** Só material `type: 'link'` tinha, e o
    renderer nunca a usava — o botão de download em link já falhava com
    "Script not provided". Agora link mostra 🔗 sem botão. Se o `SEC-003`
    quiser abrir link externo via `shell.openExternal`, é aí que o campo volta.
  - **`AccountProfile.id` é o login (matrícula).** Entra no `sessionStorage.account`
    hoje; é o que o `DATA-001` vai usar para separar dados por conta.
- Behavior changes (além dos tipos):
  - `getCourseFiles`/`loadAllNews`: falha de parse (sessão expirada, deriva de
    seletor) propaga como erro codificado. Antes virava `success: true` com
    listas vazias — e uma disciplina vazia no cache.
  - Background sync: em `SELECTOR_DRIFT` no `getCourses` não tenta relogin
    (login automatizado sem chance de sucesso é só risco de bloqueio).
  - `downloadAllFiles` em falha antes de entrar na turma não devolve mais os
    contadores parciais (`skipped` de duplicatas). O renderer só usava para o
    toast; agora mostra a mensagem do erro.
  - `getCourseFiles` deixa de emitir o log de debug com script de cada arquivo.
- Follow-ups:
  - `SEC-002`: revisar se `SessionCatalogService`/`DownloadToken` com expiração
    ainda fazem sentido dado que o token é o id público do arquivo.
  - `electron/electron-env.d.ts` ainda declara `Window.ipcRenderer` como
    `IpcRenderer`; sai junto com a ponte genérica no `SEC-002`.
  - `course-detail.ts` e `dashboard.ts` ainda leem `coursesWithFiles` como
    `any` em vários pontos; o tipo `CourseSnapshot` existe, é trocar quando
    cada arquivo for tocado (catraca do ESLint).

#### Correction cycle 01 (2026-09-03) — READ review

The PTMR correction closes the four findings from the independent READ review
of `485bf75`:

- manual sync preserves prior course snapshots when a course-file request fails;
- main-process download falls back to Playwright's live DOM lookup without
  returning scripts to the renderer;
- background sync consumes `isRetryable` and relogs only on `SESSION_EXPIRED`;
- download scripts match only the supplied file id, never the filename.

Commits: `445ede5` (red tests; amended after TEST retry #2 to isolate hash
state), `2b9d459` (production implementation), and the READ closure commit.
Red-green proof reported 10 focused failures with production sources stashed;
the complete READ gate passed: typecheck clean, lint 0 errors / 77 legacy
warnings, and Vitest 190 passed | 4 skipped (194 collected). READ found no
behavioural concern, plan deviation, suspicious test, or refactor to keep.

## Ciclos PTMR

| cycle | issue | verdict | culprit | reason |
| --- | --- | --- | --- | --- |
| 01 | ARCH-001 | clean | - | Four READ-review corrections implemented; gate green. |
