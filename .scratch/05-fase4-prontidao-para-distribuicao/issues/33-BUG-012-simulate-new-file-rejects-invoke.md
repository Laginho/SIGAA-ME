# BUG-012: `simulateNewFile` rejeita a invoke quando a escrita do cache falha
Status: open
Stage: to-implement
Priority: P4
Blocked by: nenhum

- Primary files:
  - `electron/main.ts` (`simulateNewFile`, e o item de tray `:224`)
  - `electron/ipc/register-handlers.ts` (handler `test-simulate-new-file` `:350-352`)
  - `tests/unit/ipc-validation.test.ts`

#### What to build

Desde o DATA-003, `cacheService.forgetLastFile` lança quando a escrita do
`cache.json` falha. `simulateNewFile` (`main.ts:51`) não trata: pelo canal
`test-simulate-new-file` a `invoke` rejeita em vez de devolver `false`, e pelo
item de tray o `void simulateNewFile()` vira unhandled rejection no main.

Canal só de dev (`if (!deps.isPackaged)`) e de contrato `boolean`, não
`AppResult` — por isso não entrou no critério 5 do DATA-003.

#### Acceptance criteria

1. Com `forgetLastFile` lançando, `test-simulate-new-file` devolve `false` em
   vez de rejeitar a `invoke`, e o motivo vai para o log.
2. O clique no item de tray não deixa rejection sem tratamento.

#### Verification

    npx vitest run tests/unit/ipc-validation.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/ipc-validation.test.ts`: `deps.simulateNewFile` lançando, o
  handler devolve `false`. Vermelho hoje porque a promise rejeita.

## Comments

- Aberto pela revisão etapa 3 do DATA-003 (2026-09-11).
