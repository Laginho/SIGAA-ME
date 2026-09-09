# OBS-001 — Centralize, redact, rotate, and clear logs
Status: claimed
Priority: P2
Blocked by: DL-002 (fechada em 2026-09-07)
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `ARCH-001`, `DATA-002`
- Primary files:
  - `electron/services/logger.service.ts`
  - New: `electron/services/diagnostics.service.ts`
  - `electron/main.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/download.service.ts`
  - New: `tests/unit/logger-redaction.test.ts`

#### Required behavior

- Remove global console monkeypatching.
- Remove the separate unbounded scraper log.
- Use one injected logger with component scopes and operation IDs.
- Buffer writes and rotate by size with finite retention.
- Redact passwords, cookies, headers, usernames, full paths, raw HTML, JSF
  scripts, course names, and filenames from normal production logs.
- Keep HTML/trace diagnostics development-only or explicit-consent only.
- Apply retention and deletion to diagnostics.

#### Acceptance criteria

- Secrets and academic content do not appear in production logs.
- Log growth is bounded.
- Clear-all removes logs and diagnostics.
- Logger failures do not recursively call the same failing logger.

#### Verification

```text
npm run test:unit -- logger-redaction
```

#### Implementation notes

- Commit: `cdbaec5` (testes), `ab8372e` (implementação) — só `logger.service.ts`.
- Rotation policy: 1 MiB por arquivo, 2 rotações (`sigaa-me.log.1`, `.2`),
  `clear()` remove as três.
- Redaction policy: chave sensível (password/senha/pass, cookie(s), token,
  authorization/auth/header(s), username/user/email/matricula, path/filepath/
  dirpath, courseName, fileName, script, viewState — normalizada e comparada
  sem distinguir maiúscula) vira `[REDACTED]` inteira em argumentos
  estruturados; string livre passa por regex para cookie/Authorization/Bearer,
  ViewState/`j_id`, caminho absoluto Windows/Unix e blob de HTML cru.

**Escopo reduzido nesta sessão — ver `## Comments`.** Só `logger.service.ts`
foi tocado. Remoção do monkeypatch de `console.*` (`main.ts`), do
`scraper.log` (`http-scraper.service.ts`) e a migração de
`background-sync.service.ts`/`download.service.ts` (hoje só `console.*`, sem
import do logger) ficaram de fora: é migração mecânica de ~180 call sites em
6+ arquivos, sem seam próprio para testar, e voltaria a etapa 1 pela regra do
`AGENTS.md`. `diagnostics.service.ts` não foi criado: já é dono do
`PORTAL-003` (`tests/unit/diagnostics-redaction.test.ts`), que depende deste
ticket — construí-lo aqui duplicaria o trabalho.

## Comments

- 2026-09-09: ticket dividido na prática. Este commit cobre só o `LoggerService`
  (redação, rotação, `scope()`, falha não-recursiva, `app.getPath` preguiçoso —
  DEV-002). Sugestão: abrir `CLEAN-*` ou similar para (a) apagar o monkeypatch
  de `main.ts` e o `scraper.log`, (b) rotear `background-sync`/`download`
  através do logger centralizado. "Clear-all" já cobre os três destinos atuais
  (`register-handlers.ts:275-334`, DATA-002) — o follow-up é trocar as três
  chamadas por uma só, não inventar wiring novo.
