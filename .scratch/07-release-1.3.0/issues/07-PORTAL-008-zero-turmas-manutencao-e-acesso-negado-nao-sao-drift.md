# PORTAL-008: Zero turmas, manutenção e acesso negado não são drift
Status: resolved
Stage: done
Priority: P1
Blocked by: PORTAL-007
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`getCourses`, decisão de drift em `:383-395`)
  - `electron/sigaa/portal-state-classifier.ts` (`classify` `:54-60` e predicados novos)
  - `electron/sigaa/portal-adapter.ts` (`validateCourseListDocument` `:65-74`; tabela de landmarks/textos)
  - `electron/services/background-sync.service.ts` (ramo de erro de `getCourses`, `:120-130`: quais códigos alimentam o kill-switch)
  - `tests/unit/portal-compatibility.test.ts`
  - `tests/integration/portal-adapter.test.ts`
  - `tests/integration/portal-selector-resilience.test.ts`
  - `tests/integration/background-sync-compatibility.test.ts`
  - `tests/fixtures/` (fixtures sintéticas novas para manutenção e "Acesso Negado", marcadas como sintéticas; ver `DÉBITO-04`)

Itens 13 e 17 do gabarito. Ambos de Sol.

#### What to build

Item 13: `getCourses` dispara `SELECTOR_DRIFT` com zero inputs de turma,
indistinguível de conta autenticada sem turmas (fim de semestre, calouro).
`portal-state-classifier.ts:30-32` aceita esse estado como portal, e
`background-sync.service.ts:126-130` alimenta o kill-switch com ele: três
ciclos e o app se declara incompatível com o portal.

Item 17: página de manutenção e "Acesso Negado" caem em `UNKNOWN`/`SELECTOR_DRIFT`
e também contam no kill-switch (`portal-compatibility.service.ts:47-62`).

#### Acceptance criteria

1. Página autenticada (landmark de nome do usuário presente) com zero inputs
   de turma: `getCourses` devolve sucesso com lista vazia, sem diagnóstico de
   drift e sem fechar o navegador por erro.
2. Página com zero inputs **e** sem o landmark autenticado continua
   `SELECTOR_DRIFT`.
3. O classificador reconhece manutenção e "Acesso Negado" como estados
   próprios; `validateCourseListDocument` e o ramo de `getCourses` mapeiam
   manutenção para o código que já significa "portal fora do ar" (o que
   `background-sync.service.ts:120` trata como "relogar não ajuda, tenta no
   próximo ciclo") e "Acesso Negado" para `SESSION_EXPIRED` (relogin resolve).
4. Kill-switch: nenhum dos três casos chama `recordStructuralFailure`; três
   ciclos seguidos de manutenção deixam a compatibilidade em `ok`.
5. Os textos/landmarks de detecção ficam na tabela do adapter, não em string
   solta no serviço.
6. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/portal-compatibility.test.ts tests/integration/portal-adapter.test.ts tests/integration/portal-selector-resilience.test.ts tests/integration/background-sync-compatibility.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/portal-selector-resilience.test.ts`: fixture autenticada
  sem turmas → `getCourses` sucesso vazio; fixture sem landmark → drift.
  Vermelho no primeiro.
- `tests/integration/portal-adapter.test.ts`: `classify` das duas fixtures
  novas devolve os estados novos; `validateCourseListDocument` devolve os
  códigos do critério 3. Vermelho porque hoje é `UNKNOWN`/drift.
- `tests/integration/background-sync-compatibility.test.ts`: três ciclos de
  manutenção não mudam o estado de compatibilidade. Vermelho porque hoje
  conta.

#### Resolution (2026-09-15)

Verdict: Needs your call: em `validateCourseListDocument` e em `classify` o
landmark autenticado (`.nome_usuario`) é testado **antes** de manutenção e
acesso negado, então uma página "Acesso Negado" que venha dentro do shell
autenticado do SIGAA vira lista vazia com sucesso, em silêncio — e ninguém
sabe qual das duas formas a página real tem (fixtures sintéticas,
`DEBITO-04`). Antes desta ticket esse caso dava `SELECTOR_DRIFT`: errado, mas
barulhento. Não reabri porque o critério 1 manda exatamente esse
comportamento para qualquer página com o landmark, e inverter a ordem pede
fixture nova que hoje seria outro chute. Registrado sob `## Comments` do
`DEBITO-04`.

Todos os seis critérios passam; o resto da revisão não achou nada.

- Decisão: `getCourses` deixou de tratar "zero inputs de turma" como drift por
  si só e passou a perguntar ao adapter qual é o estado da página. Os quatro
  desfechos ficam no `validateCourseListDocument`, não no serviço.
- Arquivos: `electron/services/playwright-login.service.ts`,
  `electron/sigaa/portal-adapter.ts`, `electron/sigaa/portal-state-classifier.ts`,
  `electron/sigaa/selectors.ts` (tabela dos dois headings novos),
  `electron/sigaa/portal-contracts.ts` (`MAINTENANCE` no `PortalState`),
  `tests/integration/portal-selector-resilience.test.ts`,
  `tests/integration/background-sync-compatibility.test.ts`,
  `tests/fixtures/sigaa/README.md`.
- Fora dos Primary files: `portal-contracts.ts` e `selectors.ts`. O tipo
  precisava do estado novo e a tabela de landmarks que o ticket cita mora no
  `selectors.ts`, de onde o adapter importa. Nenhum outro arquivo foi tocado.
- Vermelho (`b7907cd`, commit só de teste, sem a mudança):
  `portal-selector-resilience.test.ts` 5 failed | 35 passed. Os cinco:
  lista vazia em página autenticada, manutenção → `PORTAL_UNAVAILABLE`,
  acesso negado → `SESSION_EXPIRED`, e `classify` das duas fixtures.
- O teste do critério 4 (`background-sync-compatibility.test.ts`, três ciclos
  de manutenção) já passava em `b7907cd`: `background-sync.service.ts:115`
  trata `PORTAL_UNAVAILABLE` como retryable desde antes e nunca chamou
  `recordStructuralFailure` nele. A premissa "hoje conta" da seção de testes
  estava errada — o que alimentava o kill-switch era o `SELECTOR_DRIFT` que o
  `getCourses` devolvia, e isso está coberto em vermelho acima. O teste fica
  como guarda de regressão.
- Verde: `npm run quality` — 0 erros de lint (44 warnings de `no-explicit-any`,
  pré-existentes), 71 test files, 784 passed | 5 skipped (789).
- Separação de commits: `b7907cd` e `1aecd18` tocam só teste; `1ba66cc` e
  `56e684b` tocam só produção.

## Comments

- Metade do item 13 no relatório de origem ("`0 === 0` em
  `background-sync:296`") foi refutada na verificação: `:145-149` retorna
  antes. Não há nada a corrigir ali.
- As fixtures de manutenção e acesso negado serão sintéticas até alguém
  capturar as reais; registre isso no cabeçalho do arquivo como as outras
  fazem (`tests/fixtures/README.md`).
