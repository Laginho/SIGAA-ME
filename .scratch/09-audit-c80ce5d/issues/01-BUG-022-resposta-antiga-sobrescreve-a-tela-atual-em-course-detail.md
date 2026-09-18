# BUG-022: Resposta assíncrona antiga sobrescreve a disciplina ou a notícia que o usuário está vendo
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `src/pages/course-detail.ts` (`:106`, `:493`, `:497`, `:571-605`)
  - `tests/unit/` — teste novo de navegação com operação pendente (etapa 2 escolhe o nome)

Achados 1 e 2 da auditoria `docs/audits/2026-09-17-c80ce5d.md`, reproduzidos
pelo auditor em jsdom com as páginas reais e `window.api` controlado.

#### What to build

`course-detail.ts` escreve em elementos globais (`getElementById`) depois de
`await`s longos, sem conferir se a página montada ainda é a mesma:

1. `testDownloadAll(courseId)` (`:493`, `:497`) e o "carregar todas as
   notícias" (`:106`) chamam `fetchCourseFiles(courseId)` ao concluir. Se o
   usuário voltou ao dashboard e abriu outra disciplina, o título e o conteúdo
   da disciplina antiga são desenhados sobre a nova, com os handlers dos botões
   ainda fechados sobre a nova. Reprodução: lote em `c1`, montar `c2`,
   concluir o lote — título vira `Course One`.
2. `openNewsModal` (`:571`) aguarda `getNewsDetail` segurando referências ao
   modal compartilhado. Fechar remove listeners mas não invalida o pedido;
   reabrir com outra notícia (do cache) e a resposta de `n1` chega depois e
   substitui título e corpo (`:598`, e o ramo de erro logo abaixo).
   Reprodução: abrir `n1` sem cache, fechar, abrir `n2` em cache, resolver
   `n1` — mostra `First`.

Causa única: não existe identidade de montagem/abertura. Correção mínima: um
contador de geração por página e outro por abertura do modal; capturar antes
do `await`, comparar depois. Se mudou, ainda persistir no cache (o dado é
válido e pertence à conta), só não tocar no DOM. Nada de abort controller nem
abstração nova: dois inteiros e três `if`.

#### Acceptance criteria

1. Concluir lote/erro de lote/carregar notícias de `c1` depois de `c2` montada
   não altera nenhum elemento da página de `c2`; o cache de `c1` é atualizado
   mesmo assim.
2. Resposta de `getNewsDetail` para notícia fechada não renderiza no modal,
   nem no sucesso nem no erro; o conteúdo continua sendo cacheado.
3. Fluxo normal (mesma disciplina, mesmo modal) inalterado: os testes atuais
   de `course-detail` passam sem edição.
4. Dois testes de regressão, um por cenário, vermelhos sem a correção.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/<teste novo>
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste novo em `tests/unit/`, importando `src/pages/course-detail.ts` real e
  stubando só `window.api`, com os dois cenários acima nas asserções de
  comportamento correto (título de `c2` continua `Course Two`; modal continua
  `Second`). Modelo: o `renderer.test.ts` descartável descrito na seção
  Método da auditoria.

#### Review 2026-09-18 (etapa 3) — reaberto

Verdict: Needs your call: a correção entregue está certa e provada, mas a mesma
causa raiz continua viva num terceiro caminho, dentro do mesmo arquivo.

O que está bom, e fica: commits separados (`f94fd5e` só teste, `c06977a` só
código, `diff --stat` limpo); os dois testes são vermelhos sem a correção
(`2 failed` com `src/pages/course-detail.ts` de volta ao `master`) e verdes com
ela; `npm run quality` verde (72 arquivos, 805 passed, 5 skipped); critérios 1 a
5 atendidos como escritos; nada fora dos Primary files foi tocado.

❌ O que falta: a guarda de geração em `fetchCourseFiles` está **só na entrada**
(`:173`). A função tem um `await window.api.checkFilesExistence` no meio
(`:267`) e a continuação depois dele não compara geração nenhuma. As escritas
de DOM dessa continuação caem em nós já destacados pelo `innerHTML` da nova
montagem — inofensivas —, mas duas linhas **não** são por elemento capturado:

    if (cleanupProgress) cleanupProgress()            // :374
    cleanupProgress = window.api.onDownloadProgress(…) // :376

A continuação da montagem abandonada desliga o listener de progresso da página
**atual** e instala o seu no lugar; o callback dele faz
`document.querySelectorAll('.btn-download-file')`, consulta global, e troca
botão por ✅ na lista da disciplina atual. É exatamente a classe de falha que o
ticket descreve ("não existe identidade de montagem"), num caminho que os
critérios 1 e 2 não nomeiam.

Reproduzido na revisão, em jsdom, com a correção aplicada: `c1` com um download
registrado (segura o `checkFilesExistence`), montar `c2` sem downloads
registrados (registra o listener dela), resolver o `checkFilesExistence` de
`c1` — o cleanup de `c2` é chamado uma vez. Esperado: zero.

Precisa de teste novo, então é etapa 2, não conserto de revisor.

Critério novo para esta rodada:

6. Uma continuação de `fetchCourseFiles` de montagem anterior não desliga nem
   substitui o `cleanupProgress` da montagem atual; teste de regressão
   vermelho sem a correção, no cenário acima.

Sugestão de correção mínima, coerente com o resto: reavaliar
`generation !== currentPageGeneration` depois do `await` de `:267`, antes de
seguir para o bloco de listeners — não é preciso guardar cada escrita, só as
que saem do elemento capturado.

Sem achado nas demais frentes: o incremento de `currentModalGeneration` no
`close` cobre fechar-e-reabrir; navegar para fora de `course-detail` sem
remontar a página deixa a geração igual, mas aí os `getElementById` voltam
`null` e a guarda de `:180` já corta; nenhum `any` novo, nenhum `innerHTML` com
dado do SIGAA, nenhum canal IPC tocado.

#### Resolution (2026-09-18)

Verdict: Approve

Decisão: mesclada na branch de sessão `sweatshop/2026-09-18-0902` em `2108ee1`
(`--no-ff`). Rebase dispensado: a ponta da sessão (`b77e816`) já era ancestral
da branch pelo merge `f95f0c7`, a árvore do merge é idêntica à de `bug-022`
(`git diff --stat bug-022 HEAD` vazio) e rebasear reescreveria os hashes citados
acima.

Arquivos: `src/pages/course-detail.ts` (+47/-9 sobre a base),
`tests/unit/course-detail-stale-response.test.ts` (novo, 3 testes), este ticket.

Commits: `f94fd5e` (testes dos achados 1 e 2), `c06977a` (geração por montagem e
por abertura do modal), `f79c378` (teste do achado 3), `35f2bfb` (guarda antes de
`cleanupProgress`), `fde007a` (revisão: título do teste 2, só texto). `git show
--stat` por commit: nenhum mistura teste e código.

Prova vermelho-verde, `npx vitest run tests/unit/course-detail-stale-response.test.ts`:

- fonte na base da sessão: `Tests 3 failed (3)` — `expected 'Course One' to be
  'Course Two'`, `expected 'First' to be 'Second'`, `expected "vi.fn()" to not
  be called at all, but actually been called 1 times`;
- fonte em `c06977a` (só a primeira correção): `1 failed | 2 passed (3)`, o do
  achado 3;
- fonte em HEAD: `3 passed (3)`.

Gate `npm run quality` (2026-09-18, antes e depois de `fde007a`): typecheck
limpo; ESLint 0 erros, 40 warnings (`no-explicit-any` legado, nenhum novo);
vitest `Test Files 72 passed (72)`, `Tests 806 passed | 5 skipped (811)`.

Critérios: 1 ✅ (`fetchCourseFiles` retorna em `:173` com geração diferente;
`recordDownloads`/`mergeCoursesIntoCache` rodam antes), 2 ✅ (sucesso `:633`,
erro `:636`, exceção `:643`; cache gravado antes da guarda), 3 ✅
(`course-detail.test.ts` e `course-detail-a11y.test.ts` sem edição, 22 verdes),
4 ✅ (três testes, vermelhos pelo motivo certo), 5 ✅, 6 ✅ (guarda em `:378`,
depois do `writeAccountItem('downloads')` e antes do `cleanupProgress`).

Standards (Sonnet, cego): nenhuma violação do `CLAUDE.md`; `(window as any).api`
no teste é a convenção dos outros 9 arquivos de teste. Dois smells da baseline
(Duplicated Code na forma capturar/comparar, Primitive Obsession nos contadores)
descartados: o ticket pede "dois inteiros e três `if`" e a regra 7 veda abstração.

Spec (Opus, cego), o que não virou reabertura e por quê:

- Cobertura: o teste do achado 1 dispara "carregar notícias", não o lote; os
  três gatilhos do critério 1 passam pela mesma guarda de `:173`. O teste do
  achado 2 exercita só o ramo de sucesso; os ramos de erro têm a mesma guarda em
  código. O título dizia "nem no sucesso nem no erro" — corrigido em `fde007a`.
- Remontar a página com o modal aberto destrói o `<dialog>` sem evento `close`,
  e a geração do modal não muda: a resposta pendente escreveria em
  `#modalTitle`/`#modalMeta` da montagem nova, fechados e sobrescritos na
  abertura seguinte. Só alcançável por navegação programática (o fundo fica
  inerte com o modal aberto); sem efeito visível.
- No browser o `close` é tarefa enfileirada (o polyfill de `tests/setup.ts` é
  síncrono): resposta que chegue entre `modal.close()` e o evento renderiza num
  dialog fechado e é sobrescrita na abertura seguinte. Sem efeito visível.
- Toasts de lote de montagem abandonada continuam: avisam que o lote que o
  usuário iniciou terminou; não são escrita na página.

## Comments

Limitação conhecida (revisão 2026-09-18): a geração identifica a montagem, não
a disciplina. Sair de `c1` com lote em andamento e voltar a `c1` antes de ele
terminar remonta a página, e a atualização final do lote é descartada: arquivos
concluídos antes da volta ficam ⬇️ até a próxima montagem (o listener de
progresso da montagem nova cobre os concluídos depois, e o toast de conclusão
chega). O ticket prescreveu identidade de montagem; comparar por `courseId`
resolveria este caso e é a troca a considerar se incomodar.
