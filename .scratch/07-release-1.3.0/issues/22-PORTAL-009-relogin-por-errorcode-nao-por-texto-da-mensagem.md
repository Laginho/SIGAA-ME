# PORTAL-009: Relogin decide por texto da mensagem, não por `errorCode`
Status: open
Stage: to-implement
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
2. **Depende da resposta da etapa 1.** Caminho A: só o `:423` muda, e os outros
   sete call sites ficam registrados sob `## Comments` como dívida conhecida.
   Caminho B: a entrada em turma vira um helper privado que classifica e
   relogga uma vez, e os call sites passam a usá-lo.
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
- Caminho B, se escolhido: o mesmo teste para pelo menos um call site fora do
  `downloadAllFiles`.

## Comments

- O renderer não reage a `error.code` — o único `error.code` em `src/` é
  `'CANCELLED'` (`dashboard.ts:258`). Não é deste ticket; o ganho do
  `PORTAL-007` (toast com erro classificado em vez de mensagem interna) já
  está entregue.
- Registrado no fechamento do `PORTAL-007`: "a pendência do relogin automático
  por `SESSION_EXPIRED` (`sigaa.service.ts:411` decide por texto) fica para
  ticket próprio". A linha citada lá era `:411`; depois dos merges de
  2026-09-15 e do `SEC-004` ela é `:423`.
