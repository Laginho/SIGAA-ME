# QA-008: sync-selection falha de forma intermitente na suíte cheia
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum

- Primary files:
  - `tests/unit/sync-selection.test.ts` (o `beforeEach` e as asserções de `location.hash`)

Achado pela revisão do DATA-003 (2026-09-11), sem relação com aquela mudança.

#### What to build

`npm run quality` não pode falhar por carga da máquina. Hoje falha às vezes,
sempre no mesmo lugar:

    FAIL tests/unit/sync-selection.test.ts > preserves first course snapshot and
    saves second course when first fails and second succeeds
    AssertionError: expected '#/dashboard' not to be '#/dashboard'  (:300)

Reproduz só na suíte cheia e só sob carga — isolado passa, e falha também com
`electron/` no merge-base, então não é regressão de código de produção. O
`jsdom` é por arquivo, não por teste: `window.location.hash` sobrevive de um
teste para o próximo dentro do arquivo, e uma navegação agendada por timer de um
teste anterior chega atrasada dentro deste.

#### Acceptance criteria

1. `location.hash` volta a um valor conhecido no `beforeEach` do arquivo (ou a
   asserção deixa de depender de estado deixado pelo teste anterior).
2. Nenhum timer pendente de um teste vaza para o seguinte — o teste espera o que
   precisa esperar em vez de contar voltas de `flushAll()`.
3. `npx vitest run` passa 5 vezes seguidas na suíte cheia.

#### Verification

    npx vitest run tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Não há teste novo: o alvo é o próprio teste. A prova é a repetição da suíte
  cheia (critério 3), não um vermelho sintético.

## Comments
