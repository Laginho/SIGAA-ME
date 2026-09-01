# Orquestração PTMR — amarrações deste repositório

O loop genérico (PLAN → TEST → MAKE → READ, commits por fase, ledger, Cast) está
em `.agents/skills/ptmr/SKILL.md`; os contratos por papel em
`.agents/skills/ptmr/roles/`. Este arquivo só diz o que o loop deixa em aberto e
é específico daqui.

## Regras que valem para todo papel

`CLAUDE.md` é lei: sem `innerHTML` com dado do SIGAA, sem `as any` atravessando
o IPC, sem `try/catch` que só faz `console.error`, canal IPC novo com tipo e
validação, credencial nunca em código, retorno de IPC como união discriminada,
nenhuma abstração para um caso. Antes de mexer em scraping, `ARCHITECTURE.md`.
Não existe `CONTEXT.md`; o vocabulário do domínio está no `CLAUDE.md`, no
`ARCHITECTURE.md` e nas próprias tarefas do tracker.

## Rastreador de issues

**A issue é a tarefa do `docs/HARDENING_TRACKER.md`** (`BUG-003`, `QA-003`,
`BUG-004`, `ARCH-001`...). Não se cria arquivo de issue em `.scratch/`; o
handoff aponta para a seção do tracker (`docs/HARDENING_TRACKER.md#bug-003`) e
o `Problem` + `Acceptance criteria` dela são a especificação.

- Vocabulário de `Status:` é o da seção "Status vocabulary" do tracker
  (`NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `PARTIAL`, `IN REVIEW`, `DONE`). PLAN atualiza
  a linha `Status:` e a linha `Owner:` da tarefa ao fechar o ciclo; o texto do
  status segue o padrão já usado (ex.: `` `IN REVIEW` — código e testes
  prontos (sessão AAAA-MM-DD); falta X, que é do Bruno ``).
- A ordem das tarefas é a do `docs/PLANO.md` e da seção "Master dependency
  order" do tracker. PTMR só recebe tarefas médias em diante; tarefas
  triviais vão direto, sem PTMR (decisão de 2026-09-01).
- Toda correção de bug precisa de um teste que falharia sem ela (`CLAUDE.md`,
  "Antes de commitar", item 5). Teste chama código de produção, não uma cópia
  (ver `tests/fixtures/README.md` e `QA-005`).

## Branch base

`master`. Traycer cria o worktree e nomeia o branch `traycer/*`.

## Gate

| O que | Comando | Observação |
|---|---|---|
| Gate completo | `npm run quality` | typecheck + lint + testes, nessa ordem. É o que READ roda |
| Só tipos | `npm run typecheck` (`tsc --noEmit`) | |
| Só lint | `npm run lint` (`eslint .`) | 0 erros obrigatório; ~110 warnings `no-explicit-any` são legado, não introduza novos em fronteira |
| Só suíte | `npm test` (`vitest run`) | termina sozinho |
| Um arquivo | `npx vitest run tests/unit/foo.test.ts` | |
| Visual | `npx playwright test visual.spec.ts` | só quando a mudança é de UI; screenshots em `_agent_tmp/shots/` |

**O que não entra no loop:** `npm run build`/empacotamento, `test:e2e` completo e
`tests/integration/scraper.test.ts` (login real no SIGAA — manual, antes de
release, só o Bruno). Um papel nunca roda nada que exija `.env`.

**Ambiente:** `npm install`/`npm ci` só no Windows, pelo autor. Um agente num
Linux copia o repo sem `node_modules` e instala lá (~12s de gate); nunca instala
dentro da pasta montada. Detalhes e armadilhas em `CLAUDE.md`.

**Prova de vermelho-verde:** antes de reportar, MAKE/READ mostram que os testes
novos falham sem a correção (`git stash push -- <fontes>` → `vitest run` → `git
stash pop`) e passam com ela. É o que o tracker registra como "vermelho-verde
provado".

## Convenções de teste

- Unit/integration em `tests/unit/` e `tests/integration/`, sufixo `.test.ts`
  (vitest). `tests/e2e/` é **só** `*.spec.ts` (Playwright) — um `.test.ts` ali
  zera a coleta do Playwright.
- `electron` e `fs` são mockados com `vi.mock` + `vi.hoisted` e um `Map` em
  memória; copie o padrão de `tests/unit/cache-service.test.ts` ou
  `tests/integration/persistence-auth-recovery.test.ts`.
- Fixtures HTML do SIGAA em `tests/fixtures/`, com o README de lá dizendo o que
  cada uma prova.

## Commits

Conventional Commits em inglês, corpo explicando o porquê e citando a tarefa
(`fix: ... (BUG-003)`), mais o trailer de papel exigido pelo loop:

```
Role: MAKE (<modelo resolvido>)
```

Uma fase, um commit; nunca squash. Nits do master dev vão em commit `Role: MASTER`.
Autor humano dos commits é o Bruno; ninguém faz push nem merge — o PR é aberto
pelo master dev e o Bruno mescla.

## Handoffs e ledger

- Handoffs: `.scratch/<feature>/handoffs/NN-<direction>.md` (gitignorado,
  entregue por caminho absoluto). `<feature>` é o id da tarefa em minúsculas:
  `.scratch/bug-003/handoffs/01-to-plan.md`.
- Ledger: `.scratch/<feature>/ledger.md`, **commitado**. Formato do SKILL.md;
  uma linha por ciclo, inclusive os limpos.
- Nada é semeado antes do primeiro ciclo de cada tarefa.

## Registro no tracker

Ao fim de cada tarefa, o master dev acrescenta à seção dela um bloco
`#### Resolution (AAAA-MM-DD)` com decisão, arquivos, prova de vermelho-verde e
saída do gate, e atualiza a nota de handoff no fim do tracker (`> **Atualizado
em ...**`). O tracker é a memória entre sessões; o ledger é o placar dos modelos.
