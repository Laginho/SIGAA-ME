# CLEAN-009: `playwright-login`: duplicatas, método morto e comentário falso
Status: resolved
Stage: done
Priority: P3
Blocked by: PORTAL-008, DL-007
Review: agent

- Primary files:
  - `electron/services/playwright-login.service.ts` (`waitForSelector('text=Menu Turma Virtual')` em `:548-555` e `:587-596`; `page.evaluate` de entrada na turma em `:499-514` e `:697-712`; `forceReset` `:211-222`; comentário em `:688`; parâmetros `fileUrl` e `_downloadedFiles` de `downloadFile`)
  - `electron/services/sigaa.service.ts` (`:209`, o `''` passado como `fileUrl`)

Slop de dois e de um relatório sobre o arquivo de 1.119 linhas. Bloqueado por
`PORTAL-008` e `DL-007` só para não editar o arquivo em paralelo com quem muda
comportamento nele.

#### What to build

Duas esperas idênticas pelo menu da turma virtual, dois `page.evaluate`
idênticos de entrada na turma, um `forceReset` sem chamador algum, um
comentário que diz que `navigateToCourse` é "now unused" enquanto ela é
chamada em `:777`, e dois parâmetros de `downloadFile` que ninguém usa
(`fileUrl` chega sempre `''`).

#### Acceptance criteria

1. Uma função privada para a espera do menu da turma virtual; os dois pontos
   a chamam.
2. Uma função para o `page.evaluate` de entrada na turma; os dois pontos a
   chamam. Comportamento idêntico (mesmos seletores, mesmo retorno).
3. `forceReset` removido.
4. O comentário de `:688` descreve o que `navigateToCourse` faz e quem a
   chama.
5. `fileUrl` e `_downloadedFiles` removidos da assinatura de `downloadFile` e
   do chamador em `sigaa.service.ts:209`.
6. `npm run quality` verde; `tests/integration/portal-course-entry.test.ts` e
   `tests/unit/playwright-lifecycle.test.ts` verdes sem edição.

#### Verification

    npx vitest run tests/integration/portal-course-entry.test.ts tests/unit/playwright-lifecycle.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: refactor sem mudança de comportamento; a suíte existente
  de entrada na turma é a prova. O `diff --stat` da etapa 3 confere que só os
  dois arquivos mudaram e que o arquivo encolheu.

## Comments

- `getCookies` também foi apontado como "só chamado por teste". Seis testes o
  usam como seam para injetar/ler cookies; apagar troca 15 linhas por seis
  testes reescritos. Fica.
- Quebrar o arquivo (extrair leitor de notícias, entrada na turma) é
  refactor largo, fora daqui; ticket `ARCH` próprio se for feito.
- Critério 5 obrigou a tocar um terceiro arquivo fora das Primary files:
  `tests/unit/sigaa-service.test.ts` tinha três `toHaveBeenCalledWith`
  hardcoding a assinatura antiga de `downloadFile` (`''` e `{}` nas posições
  removidas). Sem ajustar essas três linhas o critério 5 não fecha — não é
  teste novo, é a expectativa velha alinhada à assinatura nova.

#### Resolution (2026-09-15)

Verdict: Needs your call: o código está certo, mas a etapa 2 editou
`tests/unit/sigaa-service.test.ts`, e "implementador não edita arquivo de teste"
(`CLAUDE.md`) está escrito sem exceção — dê uma olhada antes de aceitar o
precedente.

Merge `6e3f7e3` na branch de sessão, a partir de `6b31ca3`.

**Decisão.** Aprovado no mérito, sem correção do revisor. Os seis critérios
fecham, os dois eixos da revisão (Standards e Spec) rodaram em subagentes
separados e nenhum achou defeito de comportamento.

**Arquivos.** `electron/services/playwright-login.service.ts`,
`electron/services/sigaa.service.ts`, `tests/unit/sigaa-service.test.ts`.
`diff --stat`: 4 arquivos, +59/−64; o serviço caiu de 1144 para 1134 linhas.

**Critérios.**

1. ✅ `waitForCourseVirtualClassMenu` (`:454`), chamada em `:578` e `:613`.
   Mesmo seletor e mesmo timeout de 15000ms; cada chamador manteve o próprio
   `log.warn` e o próprio fallback, que eram diferentes entre si.
2. ✅ `clickCourseVirtualClassLink` (`:437`), chamada em `:544` e `:727`. Corpo
   idêntico aos dois blocos antigos, mesmos seletores, mesmo `{ success }`.
3. ✅ `forceReset` removido; `grep` em `electron/` e `tests/` não acha nada.
4. ✅ O comentário novo (`:715`) diz que `navigateToCourse` é chamada só pelo
   `downloadFile` — verificado, o único call site é `:791`, dentro do
   `downloadFile`.
5. ✅ `fileUrl` e `_downloadedFiles` fora da assinatura e do chamador
   (`sigaa.service.ts:204`).
6. ✅ `npm run quality` verde. `portal-course-entry.test.ts` e
   `playwright-lifecycle.test.ts` passam sem edição (o `diff --stat` confirma
   que nenhum dos dois foi tocado).

**Prova.** Refactor sem mudança de comportamento: não há teste novo, e a prova
é a suíte de entrada na turma existente rodando verde contra o código
refatorado. `npm run quality`: 0 erros de ESLint (40 warnings de
`no-explicit-any`, pré-existentes), 71 arquivos, 784 passed | 5 skipped.

**Achado.** A etapa 2 editou três `toHaveBeenCalledWith` em
`tests/unit/sigaa-service.test.ts`, arquivo fora das Primary files. As
asserções não foram enfraquecidas — saíram os dois argumentos posicionais que a
assinatura de produção perdeu, e nada mais. O critério 5 não fecha sem isso, e a
causa raiz é da etapa 1: a lista de Primary files nasceu incompleta. Não é
correção do revisor, é precedente para o humano confirmar.
