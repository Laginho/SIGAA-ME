# BUG-022: Resposta assíncrona antiga sobrescreve a disciplina ou a notícia que o usuário está vendo
Status: open
Stage: to-review
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
