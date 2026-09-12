# QA-008: teste de sync-selection falha por corrida, e o gate mente
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum

- Primary files:
  - `tests/unit/sync-selection.test.ts` (só os dois `expect(window.location.hash).not.toBe('#/dashboard')`, `:259` e `:300`, e o laço de `flushAll` que os precede)
  - `src/pages/sync-selection.ts` (só se a investigação mostrar navegação real depois de falha parcial)

Achado da revisão do `DL-003` (2026-09-11), fora dos Primary files daquele
ticket.

#### What to build

Numa das duas rodadas do gate, `preserves first course snapshot and saves
second course when first fails and second succeeds` falhou com
`expected '#/dashboard' not to be '#/dashboard'`. Sozinho o arquivo passa, e a
rodada seguinte da suíte inteira passou — flake, não regressão do `DL-003`.

O `beforeEach` (`:45`) zera `window.location.hash`, então não é vazamento entre
testes: a navegação aconteceu dentro do teste. A barreira é
`for (let i = 0; i < 10; i++) await flushAll()` — contagem fixa de flushes. Sob
carga a cadeia assíncrona avança mais, e num desses avanços a página navega para
o dashboard depois de uma disciplina ter falhado.

**Decidir qual dos dois é o caso antes de consertar:** ou a barreira é fraca e a
asserção precisa esperar um sinal em vez de contar flushes, ou a página navega
mesmo depois de falha parcial e a asserção está certa — aí é bug de produto e o
ticket cresce.

Um gate que falha uma rodada em duas não serve de trava. É P2 por isso, não pelo
teste.

#### Acceptance criteria

1. A causa está escrita na `Resolution`: barreira fraca ou navegação real.
2. `npx vitest run` passa 10 vezes seguidas sem falha neste arquivo.
3. Se for navegação real, existe teste determinístico que falha sem a correção
   de `src/pages/sync-selection.ts`.

#### Verification

    for /l %i in (1,1,10) do npx vitest run tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Depende da causa. Barreira fraca: não há teste novo, a mudança é a própria
  asserção — e aí a etapa 2 precisa provar o vermelho de outro jeito
  (reproduzir a corrida). Navegação real: teste novo em
  `tests/unit/sync-selection.test.ts`, vermelho contra o `sync-selection.ts` de
  hoje.

## Comments

- Reproduzido com a suíte inteira em paralelo, num worktree, com outras duas
  sessões de agente rodando na mesma máquina. Carga ajuda a reproduzir.
- Reproduzido de novo na revisão do `CLEAN-004` (2026-09-11), em `13d785a` —
  o `master` **antes** do merge do `DL-003` e do `CLEAN-004`. O flake não é de
  nenhum dos dois. Taxa medida: 1 falha em 4 rodadas da suíte inteira em
  `13d785a`, 1 em 4 no `master` já com o `CLEAN-004`, e 6/6 verde com o arquivo
  rodando sozinho.
- **O flake pega os dois testes do describe, não só o do `:300`.** Numa das
  rodadas caiu `does not overwrite cached files when getCourseFiles fails for a
  course`, o primeiro. A saída capturada foi só a linha `FAIL`, sem a asserção —
  não sei qual dos cinco `expect` dele falhou. Consequência para os Primary
  files deste ticket: o limite hoje é `:259` e `:300` mais o laço de
  `flushAll`; se o primeiro teste falha por outra asserção, o limite é o
  describe inteiro (`:235`–`:302`) e a barreira fraca é a causa comum dos dois.
  A etapa 1 decide isso antes da etapa 2 começar.
