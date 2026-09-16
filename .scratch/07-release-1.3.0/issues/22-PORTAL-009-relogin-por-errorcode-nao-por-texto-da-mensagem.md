# PORTAL-009: Relogin decide por texto da mensagem, não por `errorCode`
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: human

- Primary files:
  - `electron/services/sigaa.service.ts` (`:423`, e os call sites de
    `enterCourseAndGetHTML` em `:167`, `:248`, `:305`, `:420`, `:530`, `:578`,
    `:658`)
  - `tests/unit/sigaa-service.test.ts`

Achado da revisão do `PORTAL-007` (2026-09-15), verdict "Needs your call". O
`PORTAL-007` entregou o `errorCode` classificado até o renderer, mas a segunda
frase do critério 2 dele — "o relogin existente dispara" — não se realiza. O
revisor recomendou ticket próprio e ele não foi aberto na época; aberto em
2026-09-16 a pedido do autor.

#### What to build

`enterCourseAndGetHTML` já devolve `errorCode?: AppErrorCode`
(`playwright-login.service.ts:436`), e o `getCourses` por trás dele classifica
`SESSION_EXPIRED` corretamente (`:278`, `:310`). O único relogin no caminho de
entrada em turma é `sigaa.service.ts:423`, e ele decide assim:

    if (!entryResult.success && entryResult.error?.includes('not found in portal'))

Decide por substring de mensagem em inglês, não pelo código. Uma sessão
expirada devolve `SESSION_EXPIRED` com outra mensagem, o `if` não casa, e o
relogin não dispara — que é exatamente o caso para o qual ele existe.

Duas coisas, e a segunda é a que decide o tamanho do ticket:

1. A condição tem que olhar o `errorCode`.
2. Esse relogin vive **só** dentro do `downloadAllFiles`. Os outros sete call
   sites de `enterCourseAndGetHTML` no mesmo arquivo não têm relogin nenhum:
   uma sessão expirada ao abrir uma turma, ao listar arquivos ou ao ler notícia
   vira erro para o usuário sem tentativa de recuperação. O
   `background-sync.service.ts:103` tem o seu, mas lê o `getCourses()` dele,
   não a entrada em turma.

Quem escrever a etapa 1 decide se o ticket cobre só o `:423` ou recolhe a
entrada em turma num helper que todos os call sites usam. A regra 7 do
`CLAUDE.md` não impede o helper — são oito chamadores, não um. Mas o helper é
diff maior e mexe em caminho de download, então é escolha, não obviedade.

#### Acceptance criteria

1. O relogin em `sigaa.service.ts` dispara por `errorCode === 'SESSION_EXPIRED'`,
   não por `error?.includes('not found in portal')`. Se a mensagem antiga
   precisar continuar valendo por compatibilidade, isso fica explícito no código
   com o motivo, não por acidente.
2. **Caminho B** (decidido pelo autor em 2026-09-16, ver `## Comments`). A
   entrada em turma vira um helper privado de `sigaa.service.ts`: chama
   `enterCourseAndGetHTML`, e se o resultado trouxer
   `errorCode === 'SESSION_EXPIRED'`, relogga uma vez e repete a entrada. Os
   oito call sites (`:167`, `:248`, `:305`, `:420`, `:423`, `:530`, `:578`,
   `:658`) passam a usá-lo, e nenhum deles fica com relogin próprio — o do
   `:423` é absorvido pelo helper, não duplicado. O `background-sync.service.ts`
   não entra: o relogin dele lê o `getCourses()`, não a entrada em turma.
3. O relogin continua tentando **uma** vez. Nenhum laço novo, nenhum retry
   adicional — sessão que expira duas vezes seguidas é erro para o usuário.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/sigaa-service.test.ts`: `enterCourseAndGetHTML` devolve
  `{ success: false, errorCode: 'SESSION_EXPIRED', error: 'Session expired -
  please login again' }` no `downloadAllFiles`; o teste espera
  `reloginWithStoredCredentials` chamado uma vez e a entrada repetida.
  Vermelho porque hoje a mensagem não contém "not found in portal" e o `if`
  não casa.
- O mesmo teste para pelo menos um call site fora do `downloadAllFiles` —
  Caminho B é o escolhido, então essa cobertura é obrigatória, não opcional.

## Comments

- O renderer não reage a `error.code` — o único `error.code` em `src/` é
  `'CANCELLED'` (`dashboard.ts:258`). Não é deste ticket; o ganho do
  `PORTAL-007` (toast com erro classificado em vez de mensagem interna) já
  está entregue.
- Registrado no fechamento do `PORTAL-007`: "a pendência do relogin automático
  por `SESSION_EXPIRED` (`sigaa.service.ts:411` decide por texto) fica para
  ticket próprio". A linha citada lá era `:411`; depois dos merges de
  2026-09-15 e do `SEC-004` ela é `:423`.

- 2026-09-16 Attempt 1 stopped to ask: **PORTAL-009 blocked**, no code touched. Committed on branch `portal-009` (off the open session `sweatshop/2026-09-16-1046`). /  / Reason: criterion 2 says the scope "depends on the answer from stage 1" — Caminho A (fix only `sigaa.service.ts:423`) vs. Caminho B (shared relogin helper across all 8 `enterCourseAndGetHTML` call sites) — but stage 1 never picked one. That's a real scope fork, not something stage 2 should decide unilaterally. /  / Needs a human/stage-1 call: A or B? /

- **Resposta do autor (2026-09-16): Caminho B.** Sete dos oito call sites de
  `enterCourseAndGetHTML` não têm recuperação nenhuma — abrir turma, listar
  arquivos e ler notícia viram erro para o usuário quando a sessão expira. O
  Caminho A consertaria só o `downloadAllFiles`, o menos visível dos oito, e
  deixaria o mesmo sintoma nos outros sete. Critério 2 reescrito para o helper;
  o critério 3 (uma tentativa só) vale dentro dele.

- **Achado da revisão (2026-09-16), fora dos Primary files — para a etapa 1
  abrir ticket.** `playwright-login.service.ts:518` é o único `return` do
  `enterCourseAndGetHTML` **sem** `errorCode`: é o caminho do redirect para a
  tela de login (`verTelaLogin`/`logar.do`), que devolve
  `{ success: false, error: 'Session expired - please login again' }` e nada
  mais. O helper deste ticket decide por `errorCode === 'SESSION_EXPIRED'`, então
  esse caminho — o sinal mais direto de sessão expirada que o método tem — não
  dispara relogin. Os outros três caminhos de saída classificam certo (`:490`
  propaga o do `getCourses`, `:551` o do `validateCourseListDocument`, `:648` o
  do `classifyMessage`). Conserto é uma linha (`errorCode: 'SESSION_EXPIRED'` no
  `:518`) mais um teste, e o arquivo não está nos Primary files deste ticket.

#### Resolution (2026-09-16)

Verdict: Needs your call: os quatro critérios passam e o gate está verde, mas
`playwright-login.service.ts:518` devolve sessão expirada **sem** `errorCode`, e
o helper deste ticket decide por `errorCode` — esse caminho não relogga. Fora dos
Primary files; registrado acima em `## Comments` para a etapa 1.

Decisão: aprovado como está, sem correção do revisor. O achado acima precisa de
teste novo e de arquivo fora dos Primary files, então não é "small fix" — vira
ticket da etapa 1, não conserto aqui.

Arquivos: `electron/services/sigaa.service.ts` (helper `enterCourseWithRelogin`
em `:207`, sete call sites roteados), `tests/unit/sigaa-service.test.ts`
(3 testes novos).

Critérios:

1. ✅ A condição é `errorCode !== 'SESSION_EXPIRED'` (`sigaa.service.ts:211`). O
   `error?.includes('not found in portal')` saiu; o descarte é explícito no
   docblock do helper, que nomeia `NOT_FOUND` entre as falhas que devolvem a
   primeira tentativa como está.
2. ✅ Caminho B. `grep -n 'enterCourseAndGetHTML' electron/services/sigaa.service.ts`
   não acha chamada direta fora do helper: `:167`, `:274`, `:331`, `:446`,
   `:536`, `:584` e `:664` passam por ele, e nenhum ficou com relogin próprio. O
   `background-sync.service.ts` não foi tocado.
3. ✅ Uma tentativa só, provado por teste: `does not retry relogin a second time
   when the retried entry expires again (criterion 3)` — entrada expira duas
   vezes, `reloginWithStoredCredentials` chamado 1x, `enterCourseAndGetHTML` 2x,
   e o erro final sai com `code: 'SESSION_EXPIRED'`.
4. ✅ Gate verde.

Red-green:

    git checkout 5b6eb81 -- electron/services/sigaa.service.ts
    npx vitest run tests/unit/sigaa-service.test.ts
    # Tests  3 failed | 31 passed (34)
    #   - getCourseFiles: relogs in and retries course entry (PORTAL-009)
    #   - downloadAllFiles: relogs in and retries course entry (PORTAL-009)
    #   - downloadAllFiles: does not retry relogin a second time (criterion 3)
    # AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times

    git checkout HEAD -- electron/services/sigaa.service.ts
    npm run quality
    # eslint: 40 problems (0 errors, 40 warnings)
    # Test Files  72 passed (72)
    #      Tests  796 passed | 5 skipped (801)

Separação de commits: `5b6eb81` toca só `tests/unit/sigaa-service.test.ts`;
`546da7c` toca só `electron/services/sigaa.service.ts`.
