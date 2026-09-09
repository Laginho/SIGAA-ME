# CLEAN-003 — Funnel the console monkeypatch into the redacted logger
Status: open
Priority: P1
Blocked by: OBS-001

- Owner: —
- Dependencies: `OBS-001`
- Primary files:
  - `electron/main.ts`
  - `electron/services/logger.service.ts`
  - `tests/unit/logger-redaction.test.ts`
  - New: `tests/unit/console-funnel.test.ts`

#### Current state

`main.ts:27-88` mantém um segundo destino de log, independente do
`LoggerService`: `logs/app_<timestamp>.log`, escrito por wrappers de
`console.log/error/warn`. Ele é **ilimitado e sem redação**, e recebe as 201
chamadas `console.*` do `electron/` — inclusive as 85 do
`playwright-login.service.ts`, que imprimem HTML, cookie e nome de disciplina.

O `OBS-001` redigiu e rotacionou o `sigaa-me.log`, que hoje tem 1 chamador. Os
outros 200 continuam vazando neste arquivo. Os critérios "segredo não aparece em
log de produção" e "crescimento limitado" são deste ticket, não do `OBS-001`.

#### What to build

Trocar o corpo dos três wrappers por `logger.info/warn/error`, apagar
`logStream`, `openLogStream`, `formatLog`, `logsDir` e `resetAppLog`. Isso
redige e rotaciona as 201 chamadas sem tocar em nenhuma delas — a migração
call-site a call-site fica desnecessária.

Uma trava obrigatória: com `console.error` roteado para o logger, o `catch` de
`LoggerService.write` **não pode** usar `console.error` (write falha → catch →
console.error → logger.error → write → recursão infinita, exatamente o critério
de aceite do `OBS-001`). Trocar por `process.stderr.write`, que nenhum
monkeypatch alcança. O teste existente
(`logger-redaction.test.ts`, "falha não-recursiva") espia `console.error` e vai
precisar espiar `process.stderr.write` — é a única edição autorizada em teste
existente.

`resetAppLog` sai junto: `register-handlers.ts:308` passa a ser coberto por
`deps.logger.clear()` na linha 306. Remover a chamada e o campo em `deps`.

#### Acceptance criteria

- Não existe segundo arquivo de log; `logs/` deixa de ser criado.
- Um `console.log` com cookie/ViewState/HTML/caminho absoluto sai redigido no
  `sigaa-me.log`.
- Falha persistente de escrita não recursa, com o console já monkeypatchado.
- Clear-all continua removendo tudo, com uma chamada a menos.

#### Verification

```text
npm run test:unit -- console-funnel logger-redaction log-reset
npm run quality
```

#### Implementation notes

- Commit: —
