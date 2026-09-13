# BUG-012: `simulateNewFile` rejeita a invoke quando a escrita do cache falha
Status: open
Stage: to-review
Priority: P4
Blocked by: nenhum

- Primary files:
  - `electron/main.ts` (`simulateNewFile`, e o item de tray `:224`)
  - `electron/ipc/register-handlers.ts` (handler `test-simulate-new-file` `:350-352`)
  - `tests/unit/ipc-validation.test.ts`
  - `tests/integration/dev-cache-mutation-boundary.test.ts` (acrescentado pela
    revisão: é o único seam que boota o `main.ts` de verdade, com `cacheService`
    real e `fs` mockado)

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

#### Revisão etapa 3 (2026-09-13) — reaberto

Código correto, prova faltando. O `dfdf4d8` põe `try/catch` nas duas camadas e
as duas devolvem `false` com o motivo no log. O gate está verde (686 passed, 5
skipped, 0 erro de lint), a separação de commit está certa (`ab64846` só toca
teste, `dfdf4d8` não toca teste), e o teste novo é vermelho de verdade sem a
correção — verificado revertendo `electron/` para `ab64846`.

O que derruba: **revertendo só `electron/main.ts` a suíte inteira continua
verde** (686 passed). O único teste novo mocka `deps.simulateNewFile`, ou seja,
exercita a segunda linha de defesa do handler; o `catch` em volta do
`forgetLastFile` — que é a causa nomeada em "What to build" e o que evita a
unhandled rejection do tray — não tem nada em cima. É o item 5 do CLAUDE.md e o
caso do `QA-003`.

- Critério 1 ❌ — o comportamento existe, mas nenhum teste roda com
  `forgetLastFile` lançando; o teste committado nunca chega ao `main.ts`.
- Critério 2 ❌ — sem teste, e depende inteiramente do hunk do `main.ts`.

O que falta na etapa 2, na branch que já existe:

1. Em `tests/integration/dev-cache-mutation-boundary.test.ts`, com o main
   bootado por `bootMain(false)`: fazer `harness.fs.writeFileSync` lançar uma
   vez e afirmar que `testApi.simulateNewFile()` resolve `false`, e que
   `harness.syncNow` não foi chamado. Vermelho hoje porque a promise rejeita.
2. Não mexer no `electron/` — a correção está certa como está.

Fora do escopo, não corrigido: o item de tray "Sincronizar Agora" (`main.ts:285`)
chama `backgroundSyncService.syncNow()` sem `void` e sem `catch`. Hoje é inócuo
(`runSync` engole tudo no próprio `catch`, e o coordenador só rejeita se `fn`
rejeitar), por isso não virou ticket.

#### Etapa 2 (2026-09-13) — teste prescrito não discriminava

O teste pedido (`testApi.simulateNewFile()` resolve `false` com
`writeFileSync` lançando) foi escrito, mas revertendo só o `try/catch` do
`main.ts` a suíte continuava verde: o `catch` do handler em
`register-handlers.ts` (segunda linha de defesa, mesmo commit `dfdf4d8`) já
cobre esse retorno sozinho. Um teste nesse seam não cai sem **os dois**
catches — confirmado revertendo ambos os arquivos para `ab64846`, vermelho;
restaurados, verde. Isso ainda cobre o critério 1 como está escrito (fala do
retorno da `invoke`, não de qual camada garante), mas não toca o critério 2.

Acrescentei um segundo teste no mesmo arquivo: acha o item de tray `[Dev]
Simular Arquivo Novo` no template capturado, chama `.click()` direto, e
escuta `process.on('unhandledRejection')`. Vermelho contra `ab64846` (a
rejection escapa, ninguém no caminho do tray a captura), verde com o commit
atual. Cobre o critério 2, que ficava sem teste algum.

Nenhum arquivo em `electron/` mudou — só o teste, commit `5d9d609` em cima da
`bug-012`.
