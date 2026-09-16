# PORTAL-011: Redirect para a tela de login sai sem `errorCode`, e o relogin não dispara
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`enterCourseAndGetHTML`,
    o `return` do redirect para login, `:518`)
  - `tests/unit/sigaa-service.test.ts`

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

    npx vitest run tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sigaa-service.test.ts`: `enterCourseAndGetHTML` devolve
  `{ success: false, error: 'Session expired - please login again' }` **sem**
  `errorCode`; o teste espera `reloginWithStoredCredentials` chamado uma vez e a
  entrada repetida. Vermelho porque hoje o helper só olha o `errorCode`, que não
  vem, e devolve a primeira falha como está.

## Comments

- Registrado na revisão do `PORTAL-009` (2026-09-16): "conserto é uma linha
  (`errorCode: 'SESSION_EXPIRED'` no `:518`) mais um teste, e o arquivo não está
  nos Primary files deste ticket".
- O teste vive em `tests/unit/sigaa-service.test.ts` porque o que se prova é o
  comportamento do helper, não o do `playwright-login` — o mock de
  `enterCourseAndGetHTML` já existe lá, dos três testes do `PORTAL-009`.
