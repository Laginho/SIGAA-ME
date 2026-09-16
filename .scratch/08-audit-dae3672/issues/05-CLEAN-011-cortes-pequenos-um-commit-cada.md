# CLEAN-011: Cortes pequenos da auditoria `dae3672`, um commit cada
Status: open
Stage: to-review
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/course-detail.ts` (`:288-289` e `:591-593`)
  - `src/pages/dashboard.ts` (`:371`)
  - `src/pages/sync-selection.ts` (`:287`, `:303`)
  - `electron/main.ts` (`:154`)
  - `tests/unit/preload-dev-gate.test.ts` (`:70-90`)
  - `ARCHITECTURE.md` (`:122-127`)
  - `package.json` (`:29`, script `lint`)

Slop da auditoria `docs/audits/2026-09-16-dae3672.md`. Mesmo modelo do
`CLEAN-007`: nenhum item sozinho justifica ticket; juntos são uma sessão. Um
commit por item, na ordem abaixo. Se um item der problema, os outros seguem.

#### What to build

**1. `course-detail.ts:591-593`: falha ao cachear notícia vira toast.** Hoje:

    } catch (e) {
      console.warn('Failed to cache news content:', e);
    }

`mergeCoursesIntoCache` lança `'Cache local cheio (armazenamento do
navegador)'` de propósito, e `dashboard.ts:92` e `sync-selection.ts`
transformam isso em `toast.error`. Só aqui o usuário com storage cheio não é
avisado. Regra 3 do `CLAUDE.md`. Fazer igual ao `dashboard.ts:90-93`: a
notícia continua renderizando, o toast avisa que não foi guardada offline.
Este é o único item com efeito para o usuário; é o primeiro por isso.

**2. `course-detail.ts:289`: `isDownloaded` lê o objeto pré-`await`.** O bloco
`:267-275` relê `downloads` depois de `checkFilesExistence` (`CONC-002`,
`CONC-003`), mas só dentro de `if (staleKeys.length > 0)`, e o laço de render
em `:288` usa `courseDownloads`, o objeto de antes do `await`. Download
concorrente aparece como não baixado até o próximo render. Correção: reler
uma vez depois do `await`, sem condição, e renderizar a partir da releitura.

**3. Três parses manuais de `courses` viram `readCoursesCache()`.**
`dashboard.ts:371` (`JSON.parse(cachedData)`), `sync-selection.ts:287` e
`:303` (`JSON.parse(readAccountItem('courses') || '[]').length` dentro de
IIFE com `try`). `readCoursesCache()` em `src/data/account-storage.ts:108`
existe desde o `CLEAN-007` e valida forma (`DATA-005`); os três parses não.

**4. `--sigaa-dev` morto.** `main.ts:154` passa
`additionalArguments: app.isPackaged ? [] : ['--sigaa-dev']`; desde o `DEV-001`
o preload decide por `process.env.SIGAA_DEV_BRIDGE` (`preload.ts:78`). Único
leitor: `preload-dev-gate.test.ts:70,81`, que monta e desmonta a flag em
`process.argv` e afirma no nome que o gate reage a ela. As asserções são
verdadeiras nos dois estados. Apagar a linha do `main.ts`; nos testes, apagar
o setup de argv e renomear os dois casos para o que eles provam de fato (sem
`SIGAA_DEV_BRIDGE`, só `api`, sem `ipcRenderer`, sem `simulateNewFile`). Se
os dois casos ficarem idênticos, fica um.

**5. `ARCHITECTURE.md:122-127` descreve a migração de logging no futuro.**
"Until `OBS-005` closes, services not yet migrated write to stdout only."
`OBS-001` a `OBS-005` estão `done`; não há `console` em `electron/**` fora do
logger. Trocar o parágrafo pelo estado atual em duas frases; os bullets abaixo
dele já estão certos.

**6. Catraca de warnings.** `package.json:29`: `eslint . --max-warnings 52`.
Hoje são 40. Trocar 52 por 40; a catraca só aperta se estiver encostada.
Fixar `any` fica de fora: é trabalho de verdade em `course-detail.ts` (15) e
`playwright-login.service.ts` (11), e não é este ticket.

#### Acceptance criteria

1. Item 1: com `mergeCoursesIntoCache` lançando, abrir a notícia mostra o
   corpo **e** um `toast.error` com a mensagem do erro. Nenhum
   `console.warn` sobra no `catch`.
2. Item 2: a lista de arquivos é renderizada a partir de uma leitura de
   `downloads` feita depois do `await checkFilesExistence`.
3. Item 3: `grep -n "JSON.parse" src/pages/dashboard.ts src/pages/sync-selection.ts`
   não devolve parse de `courses`.
4. Item 4: `grep -rn "sigaa-dev" electron/ src/ tests/` não devolve nada.
5. Item 5: `ARCHITECTURE.md` não cita `OBS-005` como pendente.
6. Item 6: `npm run lint` passa com `--max-warnings 40`.
7. Seis commits, um por item, cada um verde sozinho. `npm run quality` verde
   no final.

#### Verification

    npm run quality
    npx vitest run tests/unit/preload-dev-gate.test.ts

## Tests stage 2 writes (own commit, red)

- Item 1: `tests/unit/course-detail.test.ts` já tem o padrão
  (`vi.spyOn(toast, 'error')`, `:55`). Novo caso: `mergeCoursesIntoCache`
  lançando (`vi.mock` de `src/data/account-storage` ou `localStorage` cheio);
  abrir a notícia; afirmar `toast.error` chamado com a mensagem do erro e o
  corpo renderizado. Vermelho hoje: só `console.warn`.
- Item 2: se houver teste do `CONC-002`/`CONC-003` que simula download
  concorrente durante `checkFilesExistence`, estender para afirmar a classe
  do item renderizado. Se não houver harness de DOM barato, registrar em
  `## Comments` e cobrir pelo critério 2 na revisão.
- Item 4: o commit de teste é a edição de `preload-dev-gate.test.ts`
  (remover o setup de argv e renomear). Não fica vermelho: é isso que o item
  prova, as asserções nunca dependeram da flag.
- Itens 3, 5 e 6: sem teste. Deleção, texto e um número.

## Comments

- Os itens 1 e 2 são pequenos demais para ticket próprio mas não são estilo:
  um esconde erro do usuário, o outro mostra estado velho. Por isso vêm
  primeiro, e por isso o item 1 tem teste.

### Notas da implementação (2026-09-16)

- **Item 4 não cortado.** O ticket dizia "Único leitor:
  `preload-dev-gate.test.ts:70,81`" — falso hoje.
  `tests/integration/dev-cache-mutation-boundary.test.ts:111,166-177` também lê
  `additionalArguments` do `main.ts` de verdade: `bootMain(false)` captura o
  argv que o main injeta em dev (`devArgs`) e o próprio teste alimenta esse
  argv para um preload **empacotado** (`loadPreload([...productionArgs,
  ...devArgs])`) para provar que argv sozinho não libera `testApi` — a
  autoridade real é `SIGAA_DEV_BRIDGE` em `process.env` (`DEV-001`). Cortar a
  linha do `main.ts` zera `devArgs` e apaga esse caso da prova. Mesma regra do
  `CLEAN-007` item 8: leitor existe, item vira nota, não corte. A linha em
  `main.ts:154` continua.
  Critério 4 não fechado como escrito: `grep -rn sigaa-dev electron/ src/
  tests/` ainda devolve `main.ts:154` e as três ocorrências de
  `dev-cache-mutation-boundary.test.ts`. As duas que o ticket citava, em
  `preload-dev-gate.test.ts`, foram de fato removidas (commit de teste do
  item 4): os dois casos que alternavam o argv provavam o mesmo resultado —
  o preload nunca leu `process.argv` — e viraram um só, renomeado para o que
  prova de verdade.
- Item 2: não havia harness de DOM pronto para "download concorrente durante
  `checkFilesExistence`" — o `CONC-002` existente cobria só o índice em
  `localStorage`. Estendido para incluir um segundo arquivo do curso
  (`556`) e afirmar a classe `.status-done` no `file-item` renderizado, além
  da asserção de storage já existente.

Gate final: `npm run quality` verde — typecheck limpo, ESLint 0 erros / 40
warnings (baseline 52, item 6), vitest 71 arquivos, 800 passed | 5 skipped
(um a menos que antes: os dois casos do item 4 viraram um).
