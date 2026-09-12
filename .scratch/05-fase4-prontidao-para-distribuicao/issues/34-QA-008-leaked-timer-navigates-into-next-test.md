# QA-008: timer de navegação vaza de um teste para o seguinte
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum

- Primary files:
  - `tests/unit/sync-selection.test.ts` (o `beforeEach` `:40-45`, o describe
    `Sync: falha de disciplina preserva cache`, `:235`-`:302`, e os laços de
    `flushAll` dentro dele)

Aberto duas vezes em paralelo no mesmo dia, pela revisão do `DL-003` e pela do
`DATA-003` — dois arquivos com o mesmo ID (`32-QA-008-flaky-sync-selection-hash`
e `33-QA-008-flaky-sync-selection-navigation-assert`). Consolidados aqui; os
dois foram apagados. A duplicata é achado próprio, ver `#### Resolution (2026-09-11)

Aprovada na revisão sem mudança de código. Os dois commits da etapa 2 ficaram
separados como o loop exige: `31bd5b2` é o vermelho (sobe o laço para 50 com o
`flushAll` real), `44e6136` é o verde (troca a espera por microtasks). Nenhum
arquivo fora dos Primary files foi tocado; `src/pages/sync-selection.ts` ficou
intacto, como o ticket mandou.

Decisão: o describe `:235` passou a esperar só microtasks
(`flushMicrotasks = () => Promise.resolve()`). Microtask nunca cede à fase de
timers do event loop, então o `setTimeout` órfão de 600ms não tem janela para
disparar dentro desses dois testes, por mais carregada que esteja a máquina. O
timer continua vazando do teste de sucesso (`:91`) — o defeito de produto segue
fora de escopo, agora em `BUG-013`.

Critérios:

1. OK, e já estava: `beforeEach:45` zera `window.location.hash`. O que este
   diff entrega é a segunda alternativa do critério — a asserção deixou de
   depender do que o teste anterior deixou pendente.
2. OK para os dois testes nomeados, **com ressalva**: o timer órfão continua
   existindo, o que mudou é que estes testes não têm mais como observá-lo. E a
   espera continua sendo uma contagem (50 voltas), só que de microtask, não de
   relógio. Trocar por `vi.waitFor` seria pior: ele faz polling com
   `setTimeout` e reabriria exatamente a corrida.
3. OK — `npx vitest run` cinco vezes seguidas na suíte cheia, 55 arquivos,
   645 passed | 4 skipped nas cinco.
4. **Não cumprido ao pé da letra**, aceito com ressalva. O critério pedia o
   arquivo verde com o laço de `flushAll` em 50; o verde veio de substituir o
   `flushAll` por `flushMicrotasks`, então esse cenário deixou de existir. O
   que o critério queria provar — que a barreira não é mais de tempo — está
   provado por construção: microtask não cede à fase de timers. O vermelho
   do cenário original fica registrado em `31bd5b2` e foi re-rodado nesta
   revisão.

Prova red-green (re-rodada na revisão, não só herdada da etapa 2):

    # conteúdo de 31bd5b2 (flushAll real, laço em 50)
    npx vitest run tests/unit/sync-selection.test.ts
    #  FAIL  does not overwrite cached files when getCourseFiles fails for a course
    #  AssertionError: expected '#/dashboard' not to be '#/dashboard'  (:270)
    #  Tests  1 failed | 12 passed (13)

    # com HEAD
    npm run quality
    #  tsc limpo; eslint 0 errors, 57 warnings (no-explicit-any pré-existentes)
    #  Test Files 55 passed (55) | Tests 645 passed | 4 skipped (649)

Dois achados, nenhum bloqueante:

- O comentário novo (`:236-242`) usa parêntese explicativo, que o `CLAUDE.md`
  proíbe em prosa. A regra de comentário em código ("só quando o porquê não
  está óbvio") está cumprida e o conteúdo é correto. Não mexi: reescrever o
  comentário viraria commit de código e, pelo loop, PR — caro demais para isto.
- O laço de 50 microtasks está duplicado nos dois testes. É a forma que já
  existia com `flushAll`; não é duplicação nova.

Item das Comments verificado e fechado aqui: `account-isolation.test.ts` não
existe, e dos arquivos que citam `location.hash`
(`dashboard-session-actions`, `login-selector-failure`,
`renderer-content-security`, `sync-selection`) só o `renderer-content-security`
também tem laço de `flushAll` — e ali `location.hash` aparece apenas dentro de
um comentário, e o arquivo não renderiza a tela de sync, então não agenda o
timer. `jsdom` é por arquivo: não há vazamento entre arquivos. Sem exposição
irmã, sem ticket de acompanhamento para esse item.

## Comments`.

#### What to build

`npm run quality` não pode falhar por carga da máquina. Hoje falha às vezes,
sempre no mesmo arquivo:

    FAIL tests/unit/sync-selection.test.ts
    AssertionError: expected '#/dashboard' not to be '#/dashboard'

Pega os dois testes do describe, não só um: já caiu em `preserves first course
snapshot...` (`:300`) e em `does not overwrite cached files...` (`:259`).

**A causa está provada, não é mais hipótese.** O `jsdom` é por arquivo, não por
teste. `src/pages/sync-selection.ts:245` agenda
`setTimeout(() => { window.location.hash = '#/dashboard' }, 600)` no fim de um
sync **bem-sucedido**, e nada cancela esse timer. Um teste de sucesso anterior
termina com o timer pendente; o `beforeEach` do teste seguinte zera o hash; o
timer órfão dispara no meio dele e põe `#/dashboard` de volta.

O laço `for (let i = 0; i < 10; i++) await flushAll()` é barreira de tempo de
parede disfarçada de contagem: `flushAll` é `setTimeout(..., 0)`. Carga da
máquina, ou mais voltas, só decidem se o teste ainda está rodando quando os
600ms vencem. É o gatilho, não o defeito.

**O caminho de falha parcial está correto — não procure bug ali.**
`sync-selection.ts:232` faz `showError(...)` e `return` antes de qualquer
navegação.

#### Acceptance criteria

1. `location.hash` volta a um valor conhecido no `beforeEach` do arquivo (ou a
   asserção deixa de depender de estado deixado pelo teste anterior).
2. Nenhum timer pendente de um teste vaza para o seguinte — o teste espera o que
   precisa esperar em vez de contar voltas de `flushAll()`.
3. `npx vitest run` passa 5 vezes seguidas na suíte cheia.
4. O arquivo continua verde com o laço de `flushAll` elevado a 50 no describe
   `:235`-`:302`. É o critério que prova que a barreira deixou de ser de tempo.

#### Verification

    npx vitest run tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Não há teste novo: o alvo é o próprio teste. O vermelho determinístico é o
  critério 4 — subir o laço para 50 falha hoje numa máquina ociosa, em segundos.
  Use isso como prova, não a repetição da suíte cheia, que depende de carga.

## Comments

- **Taxa medida antes de a causa ser achada** (serve de linha de base, não
  precisa ser reproduzida): 1 falha em 4 rodadas da suíte inteira em `13d785a`,
  1 em 4 no `master` com o `CLEAN-004`, 6/6 verde com o arquivo sozinho. Falha
  também no merge-base, então não é regressão do `DL-003` nem do `CLEAN-004`.
- **Experimento que fechou a causa** (revisão do `DL-003`, 2026-09-11), numa
  máquina ociosa, mexendo só na contagem do laço:

  | Rodada | Resultado |
  |---|---|
  | arquivo inteiro, 10 voltas | passa |
  | arquivo inteiro, 10 voltas, máquina carregada | falha |
  | arquivo inteiro, 50 voltas | **falha** |
  | só o teste, 50 voltas | passa |
  | só o teste, 1000 voltas (~15s de relógio) | passa |

  O teste sozinho não falha por mais que se espere: ele não agenda navegação
  nenhuma. Logo o `#/dashboard` vem de fora dele.
- **Observação de produto, fora do escopo deste ticket:** o `setTimeout` de
  `:245` é disparado e esquecido, sem handle para cancelar. Um usuário que sai
  da tela nos 600ms depois de um sync bem-sucedido é puxado de volta para o
  dashboard. É pequeno, e é o que torna o vazamento possível. Se for consertar,
  ticket próprio — não amplie este.
- O mesmo padrão `flushAll` + contagem fixa está em `account-isolation.test.ts`,
  `course-detail.test.ts` e `course-detail-a11y.test.ts`. Se algum deles rodar
  depois de um teste de sucesso, tem a mesma exposição. Verificar depois que
  este fechar, não junto.
- **Achado de processo, não deste ticket:** duas sessões em paralelo criaram o
  mesmo ID `QA-008` no mesmo dia, e os prefixos `32` e `33` ficaram duplicados
  com `CLEAN-005` e `BUG-012`. O ID é endereço e é imutável; duas sessões
  escolhendo o próximo número ao mesmo tempo não colidem só por azar, colidem
  por construção. Vale decidir quem aloca ID quando há trabalho paralelo.
