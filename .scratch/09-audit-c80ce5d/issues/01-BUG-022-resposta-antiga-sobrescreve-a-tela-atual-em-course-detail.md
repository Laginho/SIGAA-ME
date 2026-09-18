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
