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
`ARCHITECTURE.md`, em `shared/domain.ts` e nas próprias tarefas.

## Rastreador de issues

**A issue é um arquivo em `.scratch/`** (desde 2026-09-03; o
`docs/HARDENING_TRACKER.md` ficou só para links antigos resolverem). Um
diretório por fase, `.scratch/NN-faseN-slug/`, com:

- `spec.md` — a seção da fase em `docs/PLANO.md`;
- `issues/NN-ID-slug.md` — uma por tarefa (`ARCH-001`, `SEC-002`, ...). O
  `Problem`/`Required ...` + `Acceptance criteria` dela são a especificação;
- `ledger.md` — tabela `| Data | ID | Commit |` das tarefas **fechadas** da
  fase. Não confundir com o ledger do PTMR (abaixo);
- `handoffs/` — gitignorado, ver abaixo.

O handoff aponta para o arquivo da issue por caminho absoluto.

- Vocabulário da linha `Status:` no topo da issue: `open`, `claimed`,
  `resolved`, `blocked`. PLAN põe `claimed` ao começar o ciclo e `resolved` ao
  fechar com gate verde; uma revisão que derruba uma issue fechada a devolve a
  `open` e marca na lista de critérios qual caiu (❌ com o motivo e o
  apontador para a revisão). Quem fecha a issue também acrescenta a linha em
  `ledger.md` da fase; quem reabre, remove.
- A ordem das tarefas é a do `docs/PLANO.md` (a Fase 3 respeita integralmente a
  ordem de dependência). PTMR só recebe tarefas médias em diante; tarefas
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

**Prova de vermelho-verde:** antes de reportar, MAKE/READ mostram que os testes
novos falham sem a correção (`git stash push -- <fontes>` → `vitest run` → `git
stash pop`) e passam com ela. É o que a issue registra como "vermelho-verde
provado". Reportar a contagem real da suíte (`N passed | M skipped (N+M)`), não
a arredondada.

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
(`fix: ... (BUG-003)`), mais o trailer de papel exigido pelo loop:

```
Role: MAKE (<modelo resolvido>)
```

Uma fase, um commit; nunca squash. Nits do master dev vão em commit `Role: MASTER`.
Autor humano dos commits é o Bruno; ninguém faz push nem merge — o PR é aberto
pelo master dev e o Bruno mescla.

## Handoffs e ledger do PTMR

- Handoffs: `.scratch/<fase>/handoffs/NN-<direction>.md` (gitignorado por
  `.scratch/**/handoffs/`, entregue por caminho absoluto). Numeração por fase,
  a partir de `01`; uma revisão independente pode entrar ali com nome livre
  (ex.: `ARCH-001-READ-review.md`) e ser citada pelo handoff seguinte.
- Ledger do PTMR (placar dos modelos, formato do `SKILL.md`): tabela
  `## Ciclos PTMR` **no fim do arquivo da issue**, uma linha por ciclo, inclusive
  os limpos. Padrão em
  `.scratch/03-fase2-consertar-o-que-esta-quebrado/issues/02-DL-001-*.md`.
  Não existe `ledger.md` separado para o PTMR — o `ledger.md` da fase é o de
  tarefas fechadas.
- Nada é semeado antes do primeiro ciclo de cada tarefa.

## Registro na issue

Ao fim de cada ciclo, o master dev acrescenta ao arquivo da issue um bloco
`#### Resolution (AAAA-MM-DD)` (ou `#### Correction cycle NN (AAAA-MM-DD)`) com
decisão, arquivos, prova de vermelho-verde e saída do gate, e a linha no
`## Ciclos PTMR`. A issue é a memória entre sessões; a tabela de ciclos é o
placar dos modelos.
