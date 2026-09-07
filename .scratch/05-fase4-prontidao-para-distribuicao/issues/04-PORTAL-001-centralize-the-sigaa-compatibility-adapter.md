# PORTAL-001 — Centralize the SIGAA compatibility adapter
Status: resolved
Priority: P1
Blocked by: ARCH-001
Tracker status at migration: `NOT STARTED`

- Owner: Codex — especificação, 2026-09-07
- Dependencies: `ARCH-001`
- Primary files:
  - New: `electron/sigaa/selectors.ts`
  - New: `electron/sigaa/portal-contracts.ts`
  - New: `electron/sigaa/portal-state-classifier.ts`
  - New: `electron/sigaa/portal-adapter.ts`
  - `electron/services/playwright-login.service.ts`
  - `electron/services/http-scraper.service.ts`

#### Acceptance criteria

- [ ] Centralizar seletores, famílias de URL, landmarks, parsing de parâmetros
  JSF e regras de reconhecimento em `electron/sigaa/`. Os dois serviços acima
  devem consumir o adapter de produção. Mover constantes sem mover as decisões
  de compatibilidade não atende. `selectors.ts` contém seletores e fallbacks;
  `portal-contracts.ts` contém estados, transições e erros internos;
  `portal-state-classifier.ts` classifica sem navegar; `portal-adapter.ts`
  aplica as regras às operações. Sem interface/factory com uma implementação.
- [ ] Validar o documento inicial antes de preencher credenciais, clicar,
  enviar POST JSF ou interpretar dados. Validar o documento final antes de
  devolver sucesso ou instalar estado de sessão. URL de sucesso, um clique
  sem exceção ou `#conteudo` isolado não provam uma transição válida.
- [ ] Reconhecer login por formulário/campos e URL da página, nunca pela
  ocorrência de `verTelaLogin.do` em qualquer link ou texto. Um link Sair em
  uma disciplina válida não transforma a página em sessão expirada.
- [ ] Para parsing de disciplina, exigir formulário reconhecido de AVA com
  ViewState não vazio. O fallback para qualquer primeiro formulário é proibido.
  Fallbacks adicionais precisam de sinais explícitos de disciplina. Preservar
  a página vazia válida com `formAva`, action de AVA e ViewState, bem como as
  fixtures e os parsers existentes. Ausência de arquivos não é selector drift.
- [ ] Validar novamente a resposta do POST de Conteúdo. Login nessa resposta
  é sessão expirada, mesmo quando o documento anterior era válido. Sem ViewState
  no início, não enviar POST. Entrada HTTP de turma diferencia portal válido
  sem o ID pedido de página de login ou estrutura desconhecida.
- [ ] Ao falhar a atualização de uma turma, invalidar os dados JSF anteriores
  dessa turma antes de outro download. Sessão expirada invalida o estado JSF
  de todas as turmas. Não apagar cache de domínio/offline. O download seguinte
  não pode enviar token antigo; requer nova entrada e parsing bem-sucedidos.
- [ ] Falhas internas expõem `success: false`, `error: string` e
  `errorCode: AppErrorCode`, sem deduzir o código da mensagem. Preservar os
  campos de sucesso dos serviços. Usar `SESSION_EXPIRED` para login inesperado
  ou sessão ausente, `SELECTOR_DRIFT` para estrutura/estado desconhecido ou
  incompatível, `NOT_FOUND` para entidade ausente em página reconhecida e
  `PORTAL_UNAVAILABLE` para falha de transporte/indisponibilidade. Não inventar
  um código IPC paralelo. Os textos legados podem ser mantidos.
- [ ] `SigaaService` preserva o código emitido na origem ao construir
  `AppResult`; `failFromMessage` fica apenas para exceções/retornos legados sem
  código. Nenhum cookie, HTML, ViewState, URL interna ou script novo atravessa
  o IPC. Não mudar canais, payloads, DTOs de domínio ou política de retry.
- [ ] Suíte determinística existente preservada e novos testes verdes após
  implementação; typecheck e lint sem erros. Não rodar login real.

#### Contrato observado e limites

Antes desta especificação foram abertos `electron/ipc/register-handlers.ts`,
`SigaaService` e ambos os serviços de transporte. Os handlers `login-request`,
`get-courses`, `get-course-files`, `get-news-detail`, `load-all-news` e downloads
delegam ao orquestrador; seu retorno já é `AppResult`. Os scrapers ainda retornam
campos no topo e erro textual. Portanto `errorCode` é aditivo na fronteira
interna, não uma migração do IPC.

O caminho principal de arquivos é `enterCourseAndGetHTML` seguido de
`HttpScraperService.getCourseFiles(preFetchedHtml)`. A seção Conteúdo também é
alcançada pelo download em lote. Notícia usa Playwright; a variante HTTP existe
mas não é o caminho principal. O fallback de download Playwright está ligado.
Preservar essas rotas e o coordenador `CONC-001`.

| Operação | Início validado após navegação preparatória | Final validado |
|---|---|---|
| Login | LOGIN com campos/formulário reconhecidos | STUDENT_HOME ou STUDENT_PORTAL com estrutura reconhecida |
| Listar turmas | STUDENT_HOME ou STUDENT_PORTAL | STUDENT_PORTAL e lista ou estado vazio explícito |
| Entrar na turma | STUDENT_PORTAL, formulário JSF e turma alvo | COURSE_HOME, incluindo a verificação existente de `#nomeTurma` no caminho Playwright |
| Abrir Conteúdo | COURSE_HOME ou FILES_SECTION reconhecido e ViewState | FILES_SECTION válido, inclusive vazio |
| Interpretar HTML fornecido | COURSE_HOME ou FILES_SECTION com formulário AVA | Dados válidos e estado JSF instalável |
| Abrir notícia | Turma correta e formulário da notícia | NEWS_DETAIL reconhecido antes de extrair conteúdo |
| Download HTTP | Estado JSF da turma ainda válido | Validação binária existente, sem classificar binário como página |

LOGIN inesperado prevalece sobre sinais de turma remanescentes. UNKNOWN não
permite mutação nem sucesso vazio. ACCESS_DENIED ou uma turma divergente também
não permitem prosseguir. Fechamento local de browser, cookies e filesystem não
são transições DOM. O adapter não assume ownership do ciclo de vida do browser,
da fila, dos arquivos em disco ou do cache de domínio.

Escopo de produção autorizado para o implementador: os quatro novos arquivos,
os dois serviços primários e a propagação dos códigos em `sigaa.service.ts`.
Extrair helpers existentes somente se necessário para evitar duplicação.
`download.service.ts` mantém sua validação/escrita; seletores do fallback que
precisem compartilhar o registro podem ser religados sem mudar seu algoritmo.
Não implementar fingerprints, canary, captura de fixtures, telemetria, kill
switch ou novos retries de outras PORTALs. Não editar PLANO nem outra issue.

#### Testes de especificação

`tests/integration/portal-adapter.test.ts` chama classes de produção pelas APIs
públicas. Nos casos de documento, só transporte, Electron, log e escrita em
disco são substituídos. Três casos adicionais isolam a resposta pública do
produtor com spies para provar que o `SigaaService` real preserva o código
mesmo quando a mensagem não contém as palavras da heurística atual.
Não há import de módulo ainda inexistente, parser copiado, `it.fails`, acesso
a estado privado ou falha de setup usada como vermelho. Documentos pequenos
são sintéticos inline, com tokens fictícios; não são novas capturas reais.

Os casos cobrem códigos de sessão e seletor, formulário alheio, link Sair,
estados antes/depois do POST, turma ausente, falso sucesso por `#conteudo`,
token obsoleto após sessão expirada, token obsoleto após drift de parsing e
estados inicial/final de login. O mock de browser expõe
`content()` e `url()` para inspecionar os documentos; não retorna uma
classificação pronta. Caso o adapter use mais APIs do Playwright, a sessão
de especificação deve completar esse transporte; não substituir os documentos
por respostas prontas do classifier nem editar testes para enfraquecer casos.

`portal-adapter-ownership.test.ts` inspeciona a AST de produção, ignorando
comentários, e impede famílias conhecidas de seletores/JSF nos dois serviços.
É uma guarda arquitetural parcial: a revisão ainda deve verificar URLs,
fallbacks, callbacks de `page.evaluate`, parsing e chamadas reais ao adapter.
A matriz inteira acima é critério de revisão; estes casos não alegam cobertura
exaustiva de todas as transições. Dois testes existentes de sessão em
`portal-selector-resilience.test.ts` agora exigem também `errorCode` e ficam
vermelhos. Os documentos dos mocks positivos desse arquivo e de
`playwright-lifecycle.test.ts` foram completados com formulário de login e
home reconhecíveis: não podem exigir sucesso para HTML vazio após esta mudança.
As asserções positivas de ciclo de vida foram preservadas. Reutilizar os testes existentes de parser,
identidade de turma, ciclo de vida e fronteiras IPC como controles positivos.

#### Verification

```text
npx vitest run tests/integration/portal-adapter.test.ts tests/integration/portal-adapter-ownership.test.ts
npx vitest run tests/integration/portal-selector-resilience.test.ts tests/integration/parser-real.test.ts
npm run quality
```

#### Implementation notes

- Commit: 1578d00 (Sonnet, implementação) + 0b7566d (Opus, revisão)
- O comando antigo `test:integration` não existe no package.json atual;
  usar os comandos acima sem adicionar script npm nesta especificação.
- Versão anterior do adapter: inexistente. A implementação deve declarar
  `ufc-sigaa-2026.09-v1` no contrato interno. Nenhum seletor foi alterado nesta
  sessão. Nenhum material bruto ou credencial real foi usado; canary não rodou.
- Esta sessão termina no vermelho. Não é resolução da issue nem aprovação
  para implementar na mesma sessão.

#### Notas pós-auditoria para o implementador

Adicionadas em 2026-09-07 a partir dos achados 2, 3 e 5 e da nota do achado 1
da auditoria abaixo. Valem como critério de aceite.

- **Landmarks admissíveis de STUDENT_HOME/STUDENT_PORTAL.** Só os sinais que a
  produção já usa e que, portanto, existem no portal real:
  `a[href="/sigaa/verPortalDiscente.do"]`, o texto "Portal do Discente",
  `input[name="idTurma"]`, `a[id*="turmaVirtual"]` e `.nome_usuario`.
  **Proibido** reconhecer por sinal que só existe nos documentos sintéticos dos
  testes: a tag `h1`, o `name="entry"` do formulário ou qualquer id `entry:*`.
  Os mocks contêm esses sinais por conveniência; o portal real não garante
  nenhum deles.
- **Reconhecimento no caminho Playwright é
  `classify(await page.content(), page.url())`.** Sem `locator`, `$$`,
  `waitForSelector` ou `evaluate` para decidir estado. O mock de login expõe só
  `content()`, `url()` e `$` (que devolve `null`); qualquer outra API quebra os
  três casos de login por TypeError, e o implementador não edita teste.
  A verificação existente de `#nomeTurma` na entrada de turma fica como está.
- **Invalidação em qualquer falha de atualização, não só sessão expirada.**
  Caso novo em `portal-adapter.test.ts`: `getCourseFiles(courseHtml)` ok,
  `getCourseFiles('<main>…')` drift, `downloadFile` não pode chamar
  `axios.post`. Hoje o POST sai com o ViewState antigo porque o retorno de
  erro acontece antes do `courseData.set` e o estado anterior sobrevive.
  Limpar `courseData` só quando o código é `SESSION_EXPIRED` passa a suíte
  antiga e mantém o bug (`sigaa.service.ts:298-303`, `:493-494`, `:539-540`
  reaproveitam o script antigo quando o retry falha).
- **Código sem chamador em produção.** `enterCourseHTTP`
  (`http-scraper.service.ts:189`), o ramo sem `preFetchedHtml` de
  `getCourseFiles` (`:325-445`, GET `discente.jsf` + POST Conteúdo) e
  `httpScraper.getNewsDetail` não têm chamador em `electron/`, `src/` ou
  `shared/`; só os testes desta issue os chamam. Faça neles o mínimo para os
  casos passarem pelo adapter. **Não remova** esses métodos: fica para o passe
  pré-release. O revisor não tem cadeia real para validar esses cinco casos e
  deve tratá-los como cobertura do próprio adapter, não do fluxo do app.

## Auditoria cega do spec (Fable)

2026-09-07. Lidos: esta issue, `git show d82e28e -- tests`, `register-handlers.ts`
(`login-request`, `try-auto-login`, `get-courses`, `get-course-files`),
`SigaaService` (login/getCourses/getCourseFiles/downloadFile/downloadAllFiles/
loadAllNews), `HttpScraperService` (enterCourseHTTP, getCourseFiles,
downloadFile, getNewsDetail), `PlaywrightLoginService` (login, getCourses,
enterCourseAndGetHTML, close), `background-sync.service.ts:78-110`,
`shared/errors.ts`. Não implementei nada.

**Vermelho confirmado.** `npx vitest run` nos quatro arquivos tocados: 20
falhas, 12 verdes. Todas as 20 falham por asserção (`toMatchObject`/`toEqual`/
`not.toHaveBeenCalled`), nenhuma por setup, import ou TypeError. Os 5 casos de
`playwright-lifecycle.test.ts` e os 6 positivos de
`portal-selector-resilience.test.ts` seguem verdes: controles preservados.
`eslint` nos quatro arquivos: limpo. `tsc --noEmit`: limpo, mas o `tsconfig`
inclui só `src`, `electron`, `shared` — os testes não são tipados pelo gate, e o
`errorCode` nos spies do `SigaaService` não é verificado contra o tipo de
retorno dos scrapers. O implementador precisa adicionar `errorCode?:
AppErrorCode` a esses tipos por conta própria; o gate não vai cobrar.

**Contratos batem.** Os três casos de `SigaaService` esperam exatamente o shape
de `fail(code, message)` (`shared/errors.ts:51`). O caso do link Sair espera
`{ success: true, files: [], news: [] }`, que é o retorno de
`http-scraper.service.ts:711`. O caso do token obsoleto depende de
`courseData` não ser sobrescrito em falha: os dois retornos de erro
(`:347`, `:463`) acontecem antes do `courseData.set` em `:487`. Confere.

### Achados

1. **Cinco casos exercitam código sem chamador.** `enterCourseHTTP`
   (`http-scraper.service.ts:189`) não tem chamador em `electron/`, `src/` ou
   `shared/`; só o teste novo o chama. O ramo sem `preFetchedHtml` de
   `getCourseFiles` (`:325-445`, GET `discente.jsf` + POST Conteúdo) também é
   inalcançável: os nove call sites em `sigaa.service.ts` (`:167, :255, :264,
   :298, :420, :436, :493, :539, :619`) passam HTML guardado por early return.
   `httpScraper.getNewsDetail` idem. Casos afetados: "classifies session
   expiry after the HTTP files POST", "does not submit a files action when
   its starting document lacks ViewState", "distinguishes an expired entry
   page from an absent course", "reports NOT_FOUND only after recognizing the
   student portal structure", "rejects a course entry end state containing
   only the generic conteudo element". O critério "Entrada HTTP de turma
   diferencia..." e a linha "Abrir Conteúdo" da matriz descrevem esse código.
   A frase "A seção Conteúdo também é alcançada pelo download em lote" é
   verdadeira só via `navigateToFilesSection` (Playwright), não via o POST
   HTTP. Não é teste errado: o método existe e o ownership test o obriga a
   passar pelo adapter. Mas o revisor não tem cadeia real para validar esses
   cinco, e a issue deveria dizer isso para o implementador fazer o mínimo
   neles. Remover o código morto está fora do escopo autorizado; fica como
   nota para o passe pré-release.

2. **Invalidação testada só para sessão expirada; o bug real é qualquer
   falha.** Cenário: `sigaa.service.ts:298-303`. O parse do retry devolve
   drift (`<main>` no lugar da turma); `retryParseResult.success` não é
   checado, `retryScript` cai em `?? targetScript` e `downloadFile` posta o
   ViewState antigo de `courseData`. O mesmo padrão em `:493-494`
   (`retryParsedFiles = retryParseResult.files`) e `:539-540`. Uma
   implementação que só limpe `courseData` quando o código é
   `SESSION_EXPIRED` passa a suíte inteira e mantém esse bug. O critério diz
   "ao falhar a atualização", mas nenhum caso cobre falha por drift. Caso
   faltante: `getCourseFiles(courseHtml)` ok, `getCourseFiles('<main>…')`
   drift, `downloadFile` → `axios.post` não chamado.

3. **Landmarks de STUDENT_HOME/STUDENT_PORTAL sem âncora real.** Os três
   documentos sintéticos de home/portal (adapter `portalHtml`, resilience
   `portalDocument`, lifecycle) compartilham `<h1>Portal do Discente</h1>`.
   Um reconhecedor por `h1` passa tudo e pode quebrar o login real sem que a
   suíte veja. Os sinais que o código de produção já usa, e portanto existem
   no portal real: `a[href="/sigaa/verPortalDiscente.do"]`
   (`playwright-login.service.ts:271, :431`), texto "Portal do Discente"
   (`:545`), `input[name="idTurma"]` e `a[id*="turmaVirtual"]` (`:449-456`),
   `.nome_usuario` (`:134`). A issue deveria listar esses como os landmarks
   admissíveis e proibir sinais que só existem nos docs sintéticos (tag `h1`,
   `name="entry"`). Sem isso o implementador, que só vê issue e testes, não
   tem como distinguir sinal real de invenção do mock.

4. **Ownership test não inspeciona `TemplateMiddle`/`TemplateTail`.**
   `` `${prefixo}input[name="idTurma"]` `` tem head vazio e o seletor no tail;
   `'in' + 'put[...]'` também escapa. A issue já declara a guarda parcial;
   registro para o revisor grep-ar concatenação e template com expressão.
   Baixo.

5. **Mock de login expõe só `content()`, `url()` e `$` (null).** Se o adapter
   reconhecer estado por `page.locator(...)`, `page.$$` ou `waitForSelector`,
   os três casos de login quebram por TypeError, não por asserção, e o
   implementador não pode editar o teste. A issue deveria dizer que o
   reconhecimento no caminho Playwright é `classify(await page.content(),
   page.url())`, sem locator. Baixo, evita ida e volta.

Achados 2, 3 e 5 e a nota do achado 1 aplicados em 2026-09-07 (seção "Notas
pós-auditoria" acima e caso novo em `portal-adapter.test.ts`). Achado 4 fica
como instrução ao revisor.

Nada encontrado em: teste que passa sem implementar, parser copiado, teste que
exige tocar arquivo fora do limite (os únicos outros testes que constroem
`PlaywrightLoginService` são `scraper.test.ts`, live, e os três já ajustados;
`sigaa-service.test.ts` mocka os dois scrapers por módulo e só assere códigos
deduzidos de mensagens legadas, que não mudam).

## Revisão (Opus, 2026-09-07)

Diff revisado: `1578d00`, contra a issue e contra a matriz de transições.
Cadeia subida a partir de tudo que o diff toca: `register-handlers.ts` →
`SigaaService` (login/getCourses/getCourseFiles/downloadFile/downloadAllFiles/
loadAllNews) → os dois scrapers; `background-sync.service.ts:78-110` para os
consumidores de `AppErrorCode`; `shared/errors.ts` para `failFromResult`.

Confere: seletores e parsing JSF centralizados e consumidos pelos dois serviços;
`classify()` no lugar do substring `verTelaLogin.do`; `parseAvaForm` sem
fallback para o primeiro formulário; revalidação da resposta do POST de
Conteúdo; `failCourse` invalidando por turma e o catálogo inteiro em
`SESSION_EXPIRED`; `failFromResult` preservando o código na origem; nenhum
cookie, HTML, ViewState ou URL interna novo atravessando o IPC.

### Achados corrigidos nesta passada

1. **`enterCourseAndGetHTML` não validava o documento inicial** — a linha
   "Entrar na turma" da matriz. A única checagem de sessão era
   `page.url().includes('verTelaLogin')`, e o SIGAA devolve o formulário de
   login na própria `paginaInicial.do` sem trocar a URL. Nesse caso o
   `page.evaluate` não achava o `input[name="idTurma"]` e a operação saía como
   `Course link not found in portal`, que `classifyMessage` lê como
   **`NOT_FOUND`** — sessão expirada disfarçada de turma ausente, no caminho de
   produção usado por arquivos, download, notícias e sync. Agora o documento
   passa por `validateCourseListDocument` antes do clique (`SESSION_EXPIRED`
   para login, `SELECTOR_DRIFT` para estrutura desconhecida), e o ramo de turma
   realmente ausente declara `errorCode: 'NOT_FOUND'` em vez de depender da
   heurística de mensagem.

2. **A invalidação do estado JSF não cobria a falha por exceção.**
   `failCourse` cobre todo retorno de erro de `getCourseFiles`, mas o `catch`
   do método devolvia `{ success: false, error }` sem tocar em `courseData`.
   No retry de `downloadFile` (`sigaa.service.ts:298-303`), `retryScript` cai
   em `?? targetScript` e o POST seguinte reaproveita o ViewState velho — o
   mesmo bug do achado 2 da auditoria, pela porta da exceção. O `catch` agora
   apaga o catálogo da turma. Sem `errorCode`, de propósito: assim um timeout
   de rede continua virando `PORTAL_UNAVAILABLE` pela mensagem em vez de
   `UNKNOWN`.

Teste de regressão: `tests/integration/portal-course-entry.test.ts` (3 casos).
Com os dois serviços revertidos, 2 falham e o controle `NOT_FOUND` continua
verde.

### Não corrigido, registrado

- `tests/integration/download-real.test.ts` compara `readdirSync(os.tmpdir())`
  antes e depois; `download-boundary.test.ts` cria `sigaa-me-boundary-*` em
  `os.tmpdir()` a partir de outro worker. Falha intermitente do gate, sem
  relação com o PORTAL-001 (o arquivo passa isolado). Fica para uma issue
  própria.
- `enterCourseHTTP`, o ramo sem `preFetchedHtml` de `getCourseFiles` e
  `httpScraper.getNewsDetail` seguem sem chamador em produção, como a
  especificação previu. Passe pré-release.

Gate: `npm run quality` verde — 528 passed, 4 skipped, 0 erro de lint.
