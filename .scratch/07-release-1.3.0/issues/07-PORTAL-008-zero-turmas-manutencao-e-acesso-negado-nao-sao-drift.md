# PORTAL-008: Zero turmas, manutenção e acesso negado não são drift
Status: open
Stage: implementing
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

## Comments

- Metade do item 13 no relatório de origem ("`0 === 0` em
  `background-sync:296`") foi refutada na verificação: `:145-149` retorna
  antes. Não há nada a corrigir ali.
- As fixtures de manutenção e acesso negado serão sintéticas até alguém
  capturar as reais; registre isso no cabeçalho do arquivo como as outras
  fazem (`tests/fixtures/README.md`).
