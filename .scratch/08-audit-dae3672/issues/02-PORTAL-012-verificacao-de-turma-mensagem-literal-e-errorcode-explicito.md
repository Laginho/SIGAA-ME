# PORTAL-012: Falha de verificação de turma: mensagem literal e `errorCode` explícito
Status: resolved
Stage: done
Priority: P1
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`enterCourseAndGetHTML`:
    o `throw` em `:615-617` e o `catch` em `:640-646`)
  - `tests/integration/portal-course-entry.test.ts`

Achados 2 e 3 da auditoria `docs/audits/2026-09-16-dae3672.md`. Mesma linha,
um ticket.

#### What to build

Quando o cabeçalho `#nomeTurma` não bate com a turma pedida:

    // playwright-login.service.ts:615
    const errorMsg = `Playwright: Course verification failed! Page header shows "${nomeTurmaClean}" instead of "${courseName}" — the JSF session is likely still on the previous course.`;
    log.error('Playwright: Course verification failed.', { courseName, title: nomeTurmaClean });
    throw new Error(errorMsg);

Dois defeitos na mesma string.

**Vaza conteúdo acadêmico no log de produção.** `ARCHITECTURE.md:132-135`:
"Messages are literal; content goes in `meta` or does not go." O `catch` em
`:641` faz `log.error('Playwright: Error entering course.', { courseId, error })`.
Um `Error` em `meta` passa por `sanitizeError`, que só redige segredo, HTML e
caminho absoluto. Nome de turma e cabeçalho do portal saem em claro no
`app.log` empacotado. O `log.error` da linha 616 faz certo (`courseName` e
`title` em `meta`, redigidos); o `throw` da linha seguinte desfaz.

**O relogin depende de uma palavra em prosa.** O `catch` classifica por texto:

    return { success: false, error: error.message, errorCode: classifyMessage(error.message || '') };

`classifyMessage` (`shared/errors.ts:74`) casa `/session|.../i`. A frase "the JSF
**session** is likely still on the previous course" casa, devolve
`SESSION_EXPIRED`, e `enterCourseWithRelogin` (`sigaa.service.ts:217`) reloga e
tenta de novo. É a recuperação certa, por acidente: troque "JSF session" por
"JSF state" e ela some com a suíte verde. `tests/unit/course-verification.test.ts`
cobre `isExpectedCoursePage` isolada, nunca o `errorCode` deste caminho. É a
classe que o `PORTAL-009` fechou nos outros call sites.

Correção: a mensagem vira literal e o código vira explícito. O `shared/errors.ts`
já diz que o upgrade é cada origem devolver código direto em vez de deixar
`classifyMessage` deduzir. Forma mínima: em vez de `throw new Error(errorMsg)`,
`return { success: false, error: 'Verificação de turma falhou: o portal
carregou outra turma.', errorCode: 'SESSION_EXPIRED' }` dentro do `try`, com
o `log.error` da linha 616 mantido como está (já leva `courseName` e `title`
em `meta`). Se o ramo precisar continuar lançando por causa de cleanup no
`catch`, lançar um erro que carregue `code` e ler o `code` no `catch` antes de
cair em `classifyMessage`.

**Decisão a registrar antes de implementar:** `SESSION_EXPIRED` é o código
certo? O relogin reseta o estado JSF e a segunda entrada acerta a turma, então
hoje funciona. Se quem especificar preferir um código próprio, o
`enterCourseWithRelogin` precisa tratá-lo também; a forma mínima é manter
`SESSION_EXPIRED` e deixar escrito por quê.

#### Acceptance criteria

1. Nenhuma string interpolada com `nomeTurmaClean` ou `courseName` sai deste
   ramo como `message` de `Error` nem como `error` do resultado. O texto para o
   usuário é literal. Cabeçalho e turma só aparecem em `meta` do logger.
2. Com `LoggerService` em `production: () => true`, a saída para este caminho
   não contém o texto do cabeçalho `#nomeTurma` nem o nome da turma.
3. O resultado de `enterCourseAndGetHTML` neste caminho tem
   `errorCode: 'SESSION_EXPIRED'` sem passar por `classifyMessage`. Prova:
   remover a palavra "session" de qualquer string do ramo não muda o
   `errorCode`.
4. `sigaa.service.ts` não muda: a relogada por `errorCode === 'SESSION_EXPIRED'`
   já está coberta pelos testes do `PORTAL-009` em
   `tests/unit/sigaa-service.test.ts`.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/integration/portal-course-entry.test.ts tests/unit/course-verification.test.ts tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/portal-course-entry.test.ts`: no harness do `PORTAL-001`
  (mesmo padrão do teste que o `PORTAL-011` adicionou), `#nomeTurma` devolvendo
  uma turma diferente da pedida. Três `expect`: `result.errorCode ===
  'SESSION_EXPIRED'`; `result.error` não contém o texto do cabeçalho nem
  `courseName`; `result.error` não casa `/session/i`. Vermelho hoje nos dois
  últimos: `error.message` carrega cabeçalho, turma e a palavra "session". O
  terceiro `expect` é o que impede o primeiro de passar por acidente de prosa.
- Opcional, se o critério 1 não tornar o vazamento impossível por construção:
  um caso com o logger em produção (`tests/integration/logging-boundary.test.ts`
  já tem `readLog()` e `production`) provando o critério 2.

#### Resolution (2026-09-16)

Verdict: Approve

Decisão: forma mínima do ticket. O `throw new Error(errorMsg)` virou `return {
success: false, error: 'Verificação de turma falhou: o portal carregou outra
turma.', errorCode: 'SESSION_EXPIRED' }` dentro do `try`; o `log.error` da linha
acima ficou como estava. `SESSION_EXPIRED` mantido, pelo motivo do corpo: o
relogin reseta o estado JSF e a segunda entrada acerta a turma, e
`enterCourseWithRelogin` já trata esse código.

Arquivos: `electron/services/playwright-login.service.ts` (`:614-620`),
`tests/integration/portal-course-entry.test.ts` (+20). `sigaa.service.ts` não
foi tocado.

Red-green: em `146f923` (commit só de teste), `npx vitest run
tests/integration/portal-course-entry.test.ts` → 1 failed | 6 passed, falhando
em `expect(result.error).not.toMatch(/sinais e sistemas|algorithms/i)` com a
mensagem antiga interpolada. Com `e0d4437`, `npm run quality` verde: 0 erros de
lint (40 warnings `no-explicit-any` pré-existentes), 71 arquivos, 798 passed |
5 skipped.

Critérios: 1 ✅ mensagem literal, cabeçalho e turma só em `meta`. 2 ✅ por
construção — `coursename` e `title` estão em `CONTENT_KEYS`
(`logger.service.ts:92-95`), redigidos quando `production()`; o teste opcional
de logger não foi preciso. 3 ✅ código literal no `return`, sem passar pelo
`catch` nem por `classifyMessage`; o `expect(result.error).not.toMatch(/session/i)`
é a prova de que nenhuma prosa sustenta o código. 4 ✅ 5 ✅.

Observação para quem for mexer aqui, não é bloqueio: o `throw` antigo caía no
`catch`, que gravava `debug_playwright_fail_<id>.html` via
`diagnosticsService.saveRaw`. O `return` pula esse dump. Custo baixo — o
`saveRaw` só escreve quando `shouldCaptureRawArtifact` permite (fora de build
empacotado), e em dev o `log.error` já mostra `courseName` e `title` sem
redação. Os outros retornos `SESSION_EXPIRED` deste método (`:518`, `:551`)
também não gravam dump; só `SELECTOR_DRIFT` e `NOT_FOUND` gravam.

## Comments

- O `PORTAL-009` registrou "decide o relogin por `errorCode ===
  'SESSION_EXPIRED'`, não por substring de mensagem". Este é o call site que
  sobrou, e sobrou porque a substring está do lado de dentro, na mensagem que
  nós mesmos escrevemos.
