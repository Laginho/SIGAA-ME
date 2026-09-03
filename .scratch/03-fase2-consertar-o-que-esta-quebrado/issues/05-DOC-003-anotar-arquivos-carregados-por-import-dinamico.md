# DOC-003 — Anotar arquivos carregados por import dinâmico
Status: resolved
Priority: P3
Tracker status at migration: `DONE` — sessão 2026-09-02

- Status: `DONE` — sessão 2026-09-02
- Priority: `P3`
- Owner: Claude (sessão 2026-09-02)
- Dependencies: `BUG-004`
- Primary files: `electron/services/download.service.ts` — o único arquivo do
  repositório carregado via `await import()` (grep em `electron/`, `src/`,
  `shared/` em 2026-09-02; o outro acerto, `electron-env.d.ts:26`, é tipo
  `import('electron')`, não carga em runtime)

#### Acceptance criteria

- Arquivos carregados dinamicamente têm comentário no topo indicando quem os
  carrega e a partir de qual ponto de entrada, para que busca estática futura não
  chegue a conclusão errada.
- Só se aplica ao que sobrar depois da decisão do `BUG-004`.

#### Implementation notes

- Comentário de cabeçalho em `download.service.ts` com a cadeia completa até o
  ponto de entrada: IPC `download-file` → `SigaaService.downloadFile` →
  `downloadViaPlaywright` (`BUG-004`) → `PlaywrightLoginService.downloadFile` →
  `await import('./download.service')`.
- Registrado no mesmo comentário que `PlaywrightLoginService.downloadAllFiles`
  também importa o arquivo mas **continua sem chamador** — o fallback do lote
  vai por um browser por arquivo (`ponytail:` em `SigaaService.downloadAllFiles`).
- Sem teste: é comentário. A verificação é `npx tsc --noEmit`.
