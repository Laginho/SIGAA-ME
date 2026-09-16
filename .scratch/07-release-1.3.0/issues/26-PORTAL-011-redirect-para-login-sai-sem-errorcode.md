# PORTAL-011: Redirect para a tela de login sai sem `errorCode`, e o relogin não dispara
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`enterCourseAndGetHTML`,
    o `return` do redirect para login, `:518`)
  - `tests/integration/portal-course-entry.test.ts`

Achado da revisão do `PORTAL-009` (2026-09-16), verdict "Needs your call". O
revisor não consertou porque o arquivo está fora dos Primary files daquele
ticket e o conserto pede teste novo — pela regra do loop, isso é volta ao stage
2, não "small fix". Aberto a pedido do autor, que aceitou fechar o `PORTAL-009`
como está.

#### What to build

O `PORTAL-009` entregou `enterCourseWithRelogin` (`sigaa.service.ts:207`): se a
entrada em turma falha com `errorCode === 'SESSION_EXPIRED'`, ele relogga uma vez
e repete. Todos os sete call sites passam por ele.

O `enterCourseAndGetHTML` tem quatro saídas de erro, e três classificam certo:
`:490` propaga o `errorCode` do `getCourses`, `:551` o do
`validateCourseListDocument`, `:648` o do `classifyMessage`. A quarta não:

    // playwright-login.service.ts:516-518
    if (page.url().includes('verTelaLogin') || page.url().includes('logar.do')) {
        log.warn('Playwright: Redirected to login page. Session expired.');
        this.page = null;
        return { success: false, error: 'Session expired - please login again' };
    }

É o sinal mais direto de sessão expirada que o método tem — o SIGAA redirecionou
para a tela de login — e é o único que sai sem `errorCode`. O helper decide por
código, então esse caminho não relogga: o usuário vê o erro e refaz na mão o que
o app deveria refazer sozinho.

#### Acceptance criteria

1. Esse `return` passa a levar `errorCode: 'SESSION_EXPIRED'`. A mensagem não
   muda.
2. `enterCourseWithRelogin` relogga e repete a entrada quando a primeira falha
   vem por esse caminho. Uma tentativa só, como o critério 3 do `PORTAL-009`.
3. Nenhuma outra saída de `enterCourseAndGetHTML` fica sem `errorCode`.
   Confirmação: todo `return { success: false` do método nomeia um `errorCode`.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/integration/portal-course-entry.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/integration/portal-course-entry.test.ts`: novo teste no describe do
  `PORTAL-001` (mesmo harness real, `page.url()` devolvendo uma URL com
  `verTelaLogin` ou `logar.do`) chamando `enterCourseAndGetHTML` e esperando
  `result.errorCode === 'SESSION_EXPIRED'`. Vermelho hoje porque o `return` de
  `:518` não leva `errorCode`. Critério 2 não pega teste novo: a relogada por
  `errorCode === 'SESSION_EXPIRED'` já está coberta pelos testes do `PORTAL-009`
  em `tests/unit/sigaa-service.test.ts:497` e `:518` (mock de
  `enterCourseAndGetHTML`, que já cobre o "depois"), e passa a valer para este
  caminho assim que o critério 1 sai.

## Comments

- Registrado na revisão do `PORTAL-009` (2026-09-16): "conserto é uma linha
  (`errorCode: 'SESSION_EXPIRED'` no `:518`) mais um teste, e o arquivo não está
  nos Primary files deste ticket".

- 2026-09-16 Attempt 1 failed: exit 0. Log tail: **PORTAL-011 blocked, back to stage 1.** /  / The ticket names `tests/unit/sigaa-service.test.ts` as the test seam, but that file fully mocks `PlaywrightLoginService` — a test there can never fail because of the actual fix at `playwright-login.service.ts:518` (the mock returns whatever I hardcode, regardless of production code). Mocking the "before" shape (no `errorCode`) stays red forever since `sigaa.service.ts` — the only real code in that path — is outside Primary files; mocking the "after" shape passes immediately without any fix, since the existing PORTAL-009 tests (lines 497-516) already cover that case. /  / The right seam is `tests/integration/portal-course-entry.test.ts`, which already tests `PlaywrightLoginService` for real (fake `page`, no class mock) for the other three failure branches of `enterCourseAndGetHTML` — it just never exercises the `verTelaLogin`/`logar.do` branch at `:514`. /  / I reset the branch to `a6f731a` (no production or test files touched) and committed the blocked status with this reasoning on `portal-011`. Stage 1 should swap the Primary-files test target before this goes back to implementation. /

#### Resolution (2026-09-16)

Verdict: Approve

Uma linha em `playwright-login.service.ts:518` — o `return` do redirect por URL
passou a levar `errorCode: 'SESSION_EXPIRED'`, mensagem intacta. O teste novo
está em `tests/integration/portal-course-entry.test.ts:173-188`, no harness real
(`page` falso, sem mock da classe), como a correção de seam do stage 1 mandou.

Critérios:

1. ✅ `:518` leva `errorCode: 'SESSION_EXPIRED'`; a string do `error` não mudou,
   e o teste a fixa (`expect(result.error).toBe(...)`).
2. ✅ `enterCourseWithRelogin` (`sigaa.service.ts:207`) despacha só por
   `errorCode === 'SESSION_EXPIRED'` e tenta uma vez; com o critério 1 este
   caminho entra no relogin. Coberto pelos testes do `PORTAL-009` em
   `tests/unit/sigaa-service.test.ts`, sem teste novo, como o ticket previu.
3. ✅ Conferido um a um: os seis `return { success: false` do método nomeiam
   `errorCode` — `:490` (propaga o do `getCourses`), `:518`, `:551`
   (`validateCourseListDocument`), `:580` (`NOT_FOUND`), `:646` (`UNKNOWN` do
   `TypeError`) e `:648` (`classifyMessage`).
4. ✅ `npm run quality` verde.

Prova red-green, rodada pelo revisor: com o arquivo de produção revertido para a
árvore de `4f35313` e o teste novo no lugar,
`npx vitest run tests/integration/portal-course-entry.test.ts` → 1 failed |
5 passed, `AssertionError: expected undefined to be 'SESSION_EXPIRED'` na linha
185. Restaurado, `npm run quality` → 72 test files, 797 passed | 5 skipped,
ESLint 0 erros / 40 warnings (`no-explicit-any` pré-existentes).

Separação de commits conferida por `diff --stat`: `4f35313` toca só o arquivo de
teste, `56db56a` só o serviço e o ticket. Nada fora dos Primary files.

Desvio de processo, sem impacto no artefato: o commit de teste não carregou a
transição para `Stage: implementing` — ela só apareceu no commit de código, já
como `to-review`.
