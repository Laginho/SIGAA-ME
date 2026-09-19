# BUG-025: Falha de corpo de notícia não vira sucesso do lote
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/sigaa.service.ts` (`loadAllNews`, laço de detalhes e o `return ok(enrichedNews)` `:706-721`)
  - `tests/unit/` — teste novo do serviço com `getNewsDetail` falhando (etapa 2 escolhe o nome)

Achado 2 (Broken) da auditoria `docs/audits/2026-09-19-f504c40.md`,
reproduzido pelo auditor com o `SigaaService` real ligado às páginas reais:
entrada da turma e cabeçalhos ok, o único detalhe devolveu
`PORTAL_UNAVAILABLE`, o serviço respondeu `success: true` sem `content`, a
disciplina mostrou `✅ Concluído` e o sync `Finalizado!`. Decisões 1 a 4 de
`../spec.md`.

#### What to build

Quando o aluno pede o conteúdo das notícias (botão "Carregar todas" ou sync
completo) e o portal falha em qualquer corpo, o app mostra erro em vez de
conclusão. Cabeçalhos e corpos já salvos continuam no cache.

`loadAllNews` conta os detalhes que falharam. Ao fim do laço, se a contagem
for maior que zero, devolve falha com mensagem `N de M notícias sem conteúdo`
e o código de erro do primeiro detalhe que falhou. Se zero, `ok(enrichedNews)`
como hoje. Contrato `AppResult<NewsSummary[]>` inalterado; nenhum consumidor
muda.

#### Acceptance criteria

1. Todos os detalhes ok → `success: true` com os corpos, igual a hoje.
2. Um detalhe falha entre vários ok → `success: false`, mensagem contém
   `1 de M`, código igual ao `detail.error.code` desse detalhe.
3. Todos os detalhes falham → `success: false`, mensagem contém `M de M`.
4. `signal.aborted` no meio do laço continua devolvendo `CANCELLED`.
5. Falha de entrada na turma e falha de parse continuam com as mensagens
   atuais (testes existentes de `sigaa-service.test.ts` passam sem edição).
6. Teste de regressão vermelho sem a correção para os critérios 2 e 3, com o
   `SigaaService` real e `playwrightLogin`/`httpScraper` stubados.
7. Nenhum arquivo em `src/` ou `shared/` é tocado.
8. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/<teste novo> tests/unit/sigaa-service.test.ts tests/unit/sync-selection.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste novo em `tests/unit/`, seguindo a costura de `sigaa-service.test.ts`
  (mock de `electron` e do logger, `SigaaService` real com `playwrightLogin`
  e `httpScraper` substituídos por objetos com só os métodos que o fluxo
  chama: `enterCourseWithRelogin`/`enterCourse`, `getCourseFiles`,
  `getNewsDetail`, `setCookies`). Três casos: todos ok, um falha, todos
  falham. O caso "um falha" confere código e mensagem; o caso "todos ok"
  confere que o `content` chegou.
