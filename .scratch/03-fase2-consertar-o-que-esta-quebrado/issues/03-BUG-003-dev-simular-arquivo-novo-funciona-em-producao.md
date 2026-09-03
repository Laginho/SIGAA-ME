# BUG-003 — `[Dev] Simular Arquivo Novo` funciona em produção
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — ciclo PTMR 01 validado pelo master dev; Bruno confirmou no build empacotado 1.2.0 (2026-09-01) que o tray não tem `[Dev] Simular Arquivo Novo`

- Owner: PTMR (PLAN 5.6 terra · TEST/READ mimo v2.5 · MAKE muse spark 1.2); master dev Claude
- Dependencies: none
- Primary files: `electron/main.ts`, `electron/preload.ts`

#### Problem — a guarda existente está na ponta errada

| Ponta | Guardado? | Local |
|---|---|---|
| Handler IPC | Sim | `electron/main.ts:230` |
| Item do menu tray | **Não** | `electron/main.ts:344-361` |
| Preload `simulateNewFile` | **Não** | `electron/preload.ts:50-51` |

O item do tray **não passa por IPC** — a lógica está inline no callback `click`,
manipulando `cacheService['cache']` direto. A guarda protege a ponta que o
usuário não alcança e deixa livre a que ele vê e clica.

#### Acceptance criteria

- Tray de produção não contém comando de mutação de cache.
- Preload de produção não expõe `simulateNewFile`.
- Removido o acesso a membros privados por bracket notation
  (`cacheService['cache']`, `cacheService['saveCache']()`).

#### Resolution (2026-09-01) — primeiro ciclo PTMR do repositório

Ciclo limpo (ledger em `.scratch/bug-003/ledger.md`): três commits, um por fase,
`Role:` no trailer. Desenho do handoff seguido sem desvio:

- `cache.service.ts#forgetLastFile()` (público, retorna `{courseId, fileId} | null`)
  substitui as duas cópias inline e apaga todo `cacheService['...']` do `main.ts`.
- `main.ts`: uma função local `simulateNewFile()` alimenta o handler IPC (já
  guardado) e o item do tray, que agora só entra no menu com `!app.isPackaged`.
  `createWindow` passa `additionalArguments: ['--sigaa-dev']` só fora do pacote.
- `preload.ts`: `simulateNewFile` só é incluído no `api` quando
  `process.argv` tem `--sigaa-dev`; `RendererApi.simulateNewFile` virou opcional.
  Nenhum código em `src/` chamava o método.
- Conflito com o E2E (`QA-004`) resolvido sem tocar em `tests/e2e/`:
  `electron .` é não empacotado, então o gancho continua existindo no E2E.
- Testes: 3 em `cache-service.test.ts` (`forgetLastFile`), 2 em
  `preload-dev-gate.test.ts` (ponte presente com o flag, ausente sem — importa o
  preload de verdade com `electron` mockado), 1 em `preload-contract.test.ts`
  (nenhum `cacheService['` no `main.ts`). Vermelho-verde provado por MAKE.
- `npm run quality` no worktree: 0 erros de lint, 121 testes passando, 4 skipped.

## Ciclos PTMR

| cycle | issue | verdict | culprit | reason |
| --- | --- | --- | --- | --- |
| 01 | BUG-003 | clean | - | TEST, MAKE and READ completed; `npm run quality` passed. |
