# PORTAL-001 — Centralize the SIGAA compatibility adapter
Status: claimed
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
token obsoleto e estados inicial/final de login. O mock de browser expõe
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

- Commit: —
- O comando antigo `test:integration` não existe no package.json atual;
  usar os comandos acima sem adicionar script npm nesta especificação.
- Versão anterior do adapter: inexistente. A implementação deve declarar
  `ufc-sigaa-2026.09-v1` no contrato interno. Nenhum seletor foi alterado nesta
  sessão. Nenhum material bruto ou credencial real foi usado; canary não rodou.
- Esta sessão termina no vermelho. Não é resolução da issue nem aprovação
  para implementar na mesma sessão.
