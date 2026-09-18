# Fixtures versionadas do adapter (PORTAL-002)

Um diretório por versão do adapter de compatibilidade
(`electron/sigaa/portal-contracts.ts#PORTAL_ADAPTER_VERSION`), cobrindo os
estados que `portal-state-classifier.ts` e `portal-adapter.ts` reconhecem (ou
ainda não reconhecem). Ver `tests/fixtures/README.md` para o histórico do
diretório-irmão e a política de procedência.

## Procedência

Todo arquivo aqui é HTML sintético escrito à mão, no mesmo espírito dos três
fixtures originais em `tests/fixtures/`: pequeno, plausível, sem captura real
do portal. Nenhum tem cookie, ViewState de sessão real, nome, matrícula ou CPF.

## `ufc-sigaa-2026.09-v1/`

| Arquivo | Estado/cenário | O que prova |
|---|---|---|
| `login.html` | LOGIN | `classify()` reconhece o formulário; `validateLoginStart()` aceita. Reaproveitado para "sessão expirada": `validateCourseListDocument()` sobre este mesmo arquivo devolve `SESSION_EXPIRED`. |
| `login-invalid-credentials.html` | LOGIN + erro | Mensagem de erro visível não muda o estado — ainda é LOGIN. |
| `student-home.html` | STUDENT_HOME | Pouso pós-login sem lista de turmas. Só o link `Menu Discente`, sem o texto "Portal do Discente", para fixar esse ramo de `isStudentHome()` isolado. |
| `student-portal-empty.html` | STUDENT_PORTAL, 0 turmas | `.nome_usuario` sozinho já autentica o portal; `validateCourseListDocument()` aceita mesmo sem `idTurma`. |
| `student-portal-populated.html` | STUDENT_PORTAL, 3 turmas | `idTurma` + link `turmaVirtual`; `validateCourseListDocument()` aceita. Sem `.nome_usuario` de propósito: com ele a fixture classificaria pelo atalho do fallback e o ramo dos landmarks ficaria sem cobertura. Desde o `PORTAL-013` o texto do link tem o formato real `CODE - NAME` (uma turma com ` - ` também dentro do nome) e cada linha tem a célula `td.info center` com o período: `extractCourseList()` devolve as três com `id`, `code`, `name` e `period` preenchidos (`portal-adapter.test.ts`). |
| `course-home.html` | COURSE_HOME | Formulário AVA fora da URL `/ava/`. |
| `access-denied.html` | ACCESS_DENIED | Página sintética de "Acesso Negado". `classify()` reconhece o heading; `validateCourseListDocument()` devolve `SESSION_EXPIRED` — relogin resolve. |
| `maintenance.html` | MAINTENANCE | Página de manutenção programada. `classify()` reconhece o heading; `validateCourseListDocument()` devolve `PORTAL_UNAVAILABLE` — relogar não ajuda, o próximo ciclo tenta de novo. |

`news` e `empty`/`populated files` já têm fixture e teste real em
`tests/fixtures/course-page-with-news.html` e `course-page-with-files.html`/
`course-page-empty.html` (`tests/integration/parser-real.test.ts`); não
duplicados aqui.

## Degradação e deriva da lista de turmas (PORTAL-013)

Os cenários de linha reconhecida mas fora do formato ficam como HTML inline
em `portal-adapter.test.ts` e `portal-selector-resilience.test.ts`, não como
arquivo: são variações de duas linhas sobre a estrutura acima.

| Cenário | O que prova |
|---|---|
| Linha com `idTurma` + link `turmaVirtual`, texto sem ` - ` (ex.: travessão `–`) | Degradação: vira turma com `code` vazio e `name` = texto inteiro; `getCourses` devolve sucesso com todas as linhas e loga a contagem. |
| Linha com `idTurma` sem link `turmaVirtual`, ou com link de texto vazio | Deriva: `extractCourseList()` falha com `SELECTOR_DRIFT` ("N de M linhas"); `getCourses` grava diagnóstico e fecha o navegador. Nunca sucesso com menos turmas que linhas candidatas. |
| Documento sem nenhuma linha candidata | Não é falha do extrator (lista vazia): `getCourses` segue o ramo do `PORTAL-008`/`PORTAL-010` sobre o mesmo HTML. |

## `access-denied.html` e `maintenance.html` viraram estados próprios (PORTAL-008)

`portal-contracts.ts` já declarava `ACCESS_DENIED` no tipo `PortalState` antes
de `classify()` produzir esse valor; `MAINTENANCE` foi acrescentado ao tipo
junto com o reconhecimento. `NEWS_DETAIL` continua com a mesma lacuna antiga —
não é escopo desta ticket.
