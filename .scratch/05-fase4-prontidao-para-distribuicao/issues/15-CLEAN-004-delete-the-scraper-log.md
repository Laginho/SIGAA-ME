# CLEAN-004 — Delete the separate scraper log
Status: open
Priority: P2
Blocked by: CLEAN-003

- Owner: —
- Dependencies: `OBS-001`, `CLEAN-003`
- Primary files:
  - `electron/services/http-scraper.service.ts`
  - `electron/services/sigaa.service.ts`
  - `electron/ipc/register-handlers.ts`
  - `tests/unit/log-reset.test.ts`
  - `tests/e2e/clear-all.spec.ts`

#### Current state

`http-scraper.service.ts:59-83` mantém um terceiro destino: `scraper.log`, com
stream próprio, truncado no boot e sem limite durante a execução. `log()`
(L74-83) já chama `console.log(message)` **antes** de escrever no stream — ou
seja, toda linha do scraper já está no destino do `CLEAN-003`. O arquivo é
duplicata pura, sem redação.

A cauda: `resetLog()` (L107-121) existe só para truncá-lo; `clearDiagnostics()`
(`sigaa.service.ts:122-123`) não faz nada além de chamar `resetLog()`; e
`register-handlers.ts:307` chama `clearDiagnostics()` no clear-all. O nome
"diagnósticos" aqui é enganoso: os dumps `debug_*` do clear-all são outra coisa
e ficam com o `PORTAL-003`.

#### What to build

Apagar `logPath`, `logStream`, o handler de erro do stream e `resetLog()`.
`log()` vira uma chamada ao `logger.scope('http-scraper')`. Apagar
`clearDiagnostics()` e sua chamada no clear-all.

Bônus grátis: o `logPath` é inicializado no campo, com `app.getPath` no
construtor — some o último resquício do padrão que o `DEV-002` corrigiu.

#### Acceptance criteria

- `scraper.log` não é mais criado.
- As linhas do scraper aparecem no `sigaa-me.log` com prefixo `[http-scraper]`,
  redigidas.
- Clear-all continua verde sem `clearDiagnostics()`; `log-reset.test.ts` e
  `clear-all.spec.ts` deixam de checar `scraper.log`.

#### Verification

```text
npm run test:unit -- log-reset
npm run quality
```

#### Implementation notes

- Commit: —
