# Loop de trabalho — amarrações deste repositório

Três papéis, três sessões separadas. O loop existe por uma razão só: **quem
escreve os testes não é quem os faz passar.** Foi assim que 14 testes verdes
ficaram em cima de um parser quebrado (`tests/unit/parser.test.ts` testava uma
cópia). Ver `CLAUDE.md`, "Loop de trabalho".

## Regras que valem para todo papel

As "Regras do código" do `CLAUDE.md` valem em todo papel. Antes de mexer em
scraping, `ARCHITECTURE.md`. Não existe `CONTEXT.md`; o vocabulário do domínio
está no `CLAUDE.md`, no `ARCHITECTURE.md`, em `shared/domain.ts` e nas issues.

## Rastreador de issues

**A issue é um arquivo em `.scratch/`** (desde 2026-09-03; o
`docs/HARDENING_TRACKER.md` ficou só para links antigos resolverem). Um
diretório por fase, `.scratch/NN-faseN-slug/`, com:

- `spec.md` — a seção da fase em `docs/PLANO.md`;
- `issues/NN-ID-slug.md` — uma por tarefa (`ARCH-001`, `SEC-002`, ...). O
  `Problem`/`Required ...` + `Acceptance criteria` dela são a especificação;
- `ledger.md` — tabela `| Data | ID | Commit |` das tarefas **fechadas** da fase.

- Linha `Status:` no topo da issue: `open`, `claimed`, `resolved`, `blocked`.
  Quem especifica põe `claimed` ao começar; quem revisa põe `resolved` ao fechar
  com gate verde e acrescenta a linha no `ledger.md` da fase. Uma revisão que
  derruba uma issue fechada a devolve a `open`, marca qual critério caiu (❌ com
  o motivo) e remove a linha do ledger.
- A ordem das tarefas é a do `docs/PLANO.md` (a Fase 3 respeita integralmente a
  ordem de dependência). Tarefa trivial vai direto, sem loop.
- Toda correção de bug precisa de um teste que falharia sem ela (`CLAUDE.md`,
  "Antes de commitar", item 5). Teste chama código de produção, não uma cópia
  (ver `tests/fixtures/README.md` e `QA-005`).

## Branch base

`master`. Cada tarefa num branch próprio, criado a partir de `master`.

## Gate

| O que | Comando | Observação |
|---|---|---|
| Gate completo | `npm run quality` | typecheck + lint + testes, nessa ordem. É o que a revisão roda |
| Só tipos | `npm run typecheck` (`tsc --noEmit`) | |
| Só lint | `npm run lint` (`eslint .`) | 0 erros obrigatório; os warnings `no-explicit-any` são legado e só podem cair (77 em 2026-09-03); em `shared/`, `electron/main.ts` e `electron/preload.ts` `any` é erro |
| Só suíte | `npm test` (`vitest run`) | termina sozinho |
| Um arquivo | `npx vitest run tests/unit/foo.test.ts` | |
| Visual | `npx playwright test visual.spec.ts` | só quando a mudança é de UI; screenshots em `_agent_tmp/shots/` |

**O que não entra no loop:** `npm run build`/empacotamento, `test:e2e` completo e
`tests/integration/scraper.test.ts` (login real no SIGAA — manual, antes de
release, só o Bruno). Um papel nunca roda nada que exija `.env`.

**Ambiente:** `npm install`/`npm ci` só no Windows, pelo autor. Um agente num
Linux copia o repo sem `node_modules` e instala lá (~12s de gate); nunca instala
dentro da pasta montada. Detalhes e armadilhas em `CLAUDE.md`. No Windows, a
suíte rodada dentro de um sandbox pode falhar com `EPERM` ao criar
`D:\tmp\logs\app_*.log`; repetir fora do sandbox — não é falha do projeto.

**Prova de vermelho-verde:** antes de reportar, implementação e revisão mostram
que os testes novos falham sem a correção (`git stash push -- <fontes>` →
`vitest run` → `git stash pop`) e passam com ela. Reportar a contagem real da
suíte (`N passed | M skipped (N+M)`), não a arredondada.

## Convenções de teste

- Unit/integration em `tests/unit/` e `tests/integration/`, sufixo `.test.ts`
  (vitest). `tests/e2e/` é **só** `*.spec.ts` (Playwright) — um `.test.ts` ali
  zera a coleta do Playwright.
- `electron` e `fs` são mockados com `vi.mock` + `vi.hoisted` e um `Map` em
  memória; copie o padrão de `tests/unit/cache-service.test.ts` ou
  `tests/integration/persistence-auth-recovery.test.ts`.
- Mocks de `SigaaService`/`window.api` devolvem `AppResult<T>`
  (`shared/errors.ts`): `ok(data)` / `fail(code, message)`. Nunca a forma antiga
  `{ success, message, ... }`.
- Fixtures HTML do SIGAA em `tests/fixtures/`, com o README de lá dizendo o que
  cada uma prova.

## Commits

Conventional Commits em inglês, corpo explicando o porquê e citando a tarefa
(`fix: ... (BUG-003)`). Testes e implementação podem ser commits separados;
nunca squash. Autor humano dos commits é o Bruno; ninguém faz push nem merge —
a revisão abre o PR e o Bruno mescla.

## Registro na issue

Ao fechar, a revisão acrescenta ao arquivo da issue um bloco
`#### Resolution (AAAA-MM-DD)` com decisão, arquivos, prova de vermelho-verde e
saída do gate. A issue é a memória entre sessões. As tabelas `## Ciclos PTMR`
em issues antigas são registro histórico do loop anterior; não acrescente linhas.
