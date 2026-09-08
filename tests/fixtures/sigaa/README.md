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
| `student-home.html` | STUDENT_HOME | Pouso pós-login sem lista de turmas. |
| `student-portal-empty.html` | STUDENT_PORTAL, 0 turmas | `.nome_usuario` sozinho já autentica o portal; `validateCourseListDocument()` aceita mesmo sem `idTurma`. |
| `student-portal-populated.html` | STUDENT_PORTAL, N turmas | `idTurma` + link `turmaVirtual`; `validateCourseListDocument()` aceita. |
| `course-home.html` | COURSE_HOME | Formulário AVA fora da URL `/ava/`. |
| `access-denied.html` | não reconhecido | Página sintética de "Acesso Negado". Hoje `classify()` devolve `UNKNOWN` e `validateCourseListDocument()` devolve `SELECTOR_DRIFT` — não existe detecção própria ainda. Ver `PORTAL-003`/`PORTAL-005`. |
| `maintenance.html` | não reconhecido | Página de manutenção programada. Mesma lacuna do item acima. |

`news` e `empty`/`populated files` já têm fixture e teste real em
`tests/fixtures/course-page-with-news.html` e `course-page-with-files.html`/
`course-page-empty.html` (`tests/integration/parser-real.test.ts`); não
duplicados aqui.

## `access-denied.html` e `maintenance.html` não são estados novos

`portal-contracts.ts` declara `ACCESS_DENIED` no tipo `PortalState`, mas nada
em `portal-state-classifier.ts` produz esse valor — `classify()` cai em
`UNKNOWN` para as duas fixtures acima. `NEWS_DETAIL` tem a mesma lacuna. Não é
bug desta issue: implementar o reconhecimento fica para `PORTAL-003`
(diagnóstico estrutural) ou `PORTAL-005` (degradação/kill-switch). Estas
fixtures documentam a lacuna com um teste que falha se alguém apagar o
`UNKNOWN` sem adicionar reconhecimento de verdade.
