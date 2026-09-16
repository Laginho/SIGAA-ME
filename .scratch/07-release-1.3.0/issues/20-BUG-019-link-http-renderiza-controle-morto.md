# BUG-019: Link `http://` renderiza um controle que não abre nada
Status: open
Stage: to-merge
Priority: P2
Blocked by: nenhum
Review: human

- Primary files:
  - `electron/services/sigaa.service.ts` (`extractLinkUrl`)
  - `electron/security/navigation-policy.ts` (`classifyNavigation`, `:51-70`)
  - `src/styles/course-detail.css` (`.btn-open-link`, novo)
  - `electron/services/download.service.ts` (busca da linha por id, `:88-98`)
  - `tests/unit/sigaa-service.test.ts`
  - `tests/unit/navigation-policy.test.ts`
  - `tests/unit/audit-download-fallback-identity.test.ts`
  - `tests/unit/audit-download-external-url.test.ts` (do `SEC-004`; apagado
    junto com o ramo que ele exercita, ver critério 5)

Achado da revisão do `BUG-014` (2026-09-15). O `BUG-014` está fechado e o que
ele entregou funciona para `https:`; isto é o resto. A revisão do PR da sessão
(2026-09-15) somou mais dois achados, nos critérios 4 e 5.

#### What to build

`BUG-014` critério 1 manda `toCourseFile` preservar URL `http:` **ou**
`https:`. O guard do `SEC-003` devolve `blocked` para todo esquema que não é
`https:` nem `mailto:` (`navigation-policy.ts:63`), e
`tests/unit/navigation-policy.test.ts:218` fixa isso como contrato. Resultado:
um material `http://` vira um `<a>` de aparência clicável que, ao clique, só
produz um `log.warn`. É a mesma queixa do `BUG-014` — material visível que não
abre — restrita ao subconjunto `http:`.

Os dois critérios não podem valer juntos. Quem escreve o spec escolhe um dos
dois caminhos; o outro vira "não fazer".

#### Acceptance criteria

1. **Caminho B** (decidido pelo autor em 2026-09-16, ver `## Comments`).
   `classifyNavigation` passa a classificar `http:` como
   `{ kind: 'external', trusted: false }` — **sempre** com confirmação, nunca
   `trusted`, nem para host `.ufc.br` — e `navigation-policy.test.ts:218`, que
   fixa o contrato antigo do `SEC-003`, muda junto com este ID no nome.

   A checagem de credencial embutida (`url.username`/`url.password`) hoje roda
   **depois** do teste de esquema, então só vê `https:`. Ela tem que passar a
   cobrir `http:` também: `http://si3.ufc.br@evil.example/` continua `blocked`.
   A forma menor é a ordem abaixo, mas quem implementa escolhe:

       if (url.protocol !== 'https:' && url.protocol !== 'http:') {
           return { kind: 'blocked', reason: `esquema ${url.protocol}` }
       }
       if (url.username !== '' || url.password !== '') {
           return { kind: 'blocked', reason: 'credencial embutida na URL' }
       }
       if (url.protocol === 'http:') return { kind: 'external', trusted: false }
       return { kind: 'external', trusted: isTrustedHost(url) }
2. `.btn-open-link` ganha regra em `src/styles/course-detail.css`, tema claro e
   escuro, com o mesmo alvo de clique do `.btn-download-file` ao lado (40px,
   redondo) e sem o sublinhado azul que o `<a>` sem estilo herda do Chromium.
3. `npm run quality` verde, e `npm run test:e2e -- accessibility` se o
   critério 2 mexer em cor de texto ou fundo (regra do `AGENTS.md`).
4. `extractLinkUrl` filtra por host, não só por esquema: URL interna do SIGAA
   não atravessa o IPC. Independe da resposta em `## Comments`.
5. O ramo `{ type: 'href' }` da busca por id em `download.service.ts` é
   **apagado**, não consertado — decidido pelo autor em 2026-09-16, ver
   `## Comments`. Some o `return { type: 'href' }` do `page.evaluate`, some o
   `else if (freshAction.type === 'href')` que o consome (o `goto` e a checagem
   de protocolo junto), e `freshAction` passa a ser o script, sem o campo
   `type`. O caso de `href` absoluto escrito na primeira passada sai do
   `tests/unit/audit-download-fallback-identity.test.ts`, no commit de teste;
   código que deixa de existir não ganha teste novo.

   **A trava do `SEC-004` sai junto, de propósito** (autor, 2026-09-16, ver
   `## Comments`). O `if (protocol !== 'https:' || hostname !== 'si3.ufc.br')`
   vive dentro do ramo; sem o ramo não há `page.goto` para travar, e não
   navegar é mais forte que navegar checando. `tests/unit/audit-download-external-url.test.ts`
   é apagado no commit de teste: ele monta `page.evaluate` devolvendo
   `{ type: 'href' }`, uma forma que o código deixa de produzir. Nenhuma outra
   navegação do `download.service.ts` perde checagem com isso — a do
   `:121` (`page.goto(fileUrl)`) nunca teve, e é o `CLEAN-010`.

#### Verification

    npx vitest run tests/unit/sigaa-service.test.ts tests/unit/navigation-policy.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Critério 1 — `tests/unit/navigation-policy.test.ts`: `classifyNavigation` de
  um `http://` fora do app devolve `external` com `trusted: false`. Vermelho
  porque hoje devolve `blocked`, e a linha 218 afirma o contrário.
- Critério 1 — `tests/unit/navigation-policy.test.ts`: `http://algo.ufc.br/x`
  devolve `trusted: false`, não `true`. Vermelho se a implementação deixar o
  `http:` cair no `isTrustedHost` — é o teste que segura o "nunca `trusted`".
- Critério 1 — `tests/unit/navigation-policy.test.ts`:
  `http://si3.ufc.br@evil.example/` devolve `blocked`. Vermelho se a checagem
  de credencial embutida continuar valendo só para `https:`.
- Critério 4 — `tests/unit/sigaa-service.test.ts`: `toCourseFile` de um material
  `link` com `https://si3.ufc.br/sigaa/...` omite `url`. Vermelho porque hoje
  ela é preservada.
- Critério 5 — nenhum teste novo: o commit de teste só **remove** o caso de
  `href` absoluto de `tests/unit/audit-download-fallback-identity.test.ts` e o
  arquivo `tests/unit/audit-download-external-url.test.ts` inteiro. Os dois
  descrevem um `freshAction` do tipo `href`, que deixa de existir. Deleção de
  código morto não tem vermelho para provar; o que prova é o gate verde com os
  dois fora.

## Comments

- **Pergunta que travava o ticket, respondida em 2026-09-16 pelo autor:** vale
  a pena abrir `http:` no navegador do SO, ou material `http://` fica sem
  abrir? **Resposta: caminho B, abrir.** Motivos, na ordem em que pesaram:

  1. A UFC e os professores têm muito link antigo em `http:`. O caminho A
     deixaria esses materiais mortos dentro do app.
  2. O app **não carrega** a página. Um verdict `external` vai para
     `shell.openExternal`, ou seja, para o navegador padrão do SO, que já faz
     HTTPS-First e avisa em página insegura. A proteção contra conteúdo
     inseguro é do navegador, não nossa.
  3. O que o guard do `SEC-003` realmente compra é barrar `file:`,
     `javascript:`, `smb:` e handlers de protocolo registrados chegando ao
     `openExternal` — esses executam coisa. `http:` não é dessa classe; estava
     bloqueado como dano colateral do `!== https:`, não por decisão sobre
     `http:`.
  4. O dano restante seria arquivo malicioso postado por professor, que não
     acontece na prática, e o SIGAA provavelmente nem hospeda.

  O custo aceito é um diálogo de confirmação a cada clique em `http:`. O
  critério 1 já está dobrado com a resposta; este ticket está `to-implement`.
- O critério 2 é cosmético e independe da resposta: pode ir junto, em commit
  próprio.
- **Critério 4 (revisão do PR da sessão):** `extractLinkUrl` só olha o
  protocolo. O parser monta material `link` como `this.baseUrl + href` quando o
  `href` é relativo (`http-scraper.service.ts:476`), então URL interna do SIGAA
  (`https://si3.ufc.br/sigaa/...`) passa no filtro e atravessa o IPC — contra a
  regra 4 do `CLAUDE.md`. Pior: `isTrustedHost` casa `.ufc.br`, então o clique
  abre no navegador do SO **sem confirmação**, e o usuário cai numa página de
  login. Filtrar por host (descartar o que é `si3.ufc.br`, ou só o que veio
  prefixado por `baseUrl`) resolve os dois.
- **Critério 5 (revisão do PR da sessão):** no `download.service.ts`, o
  `if (!idMatch || idMatch[1] !== id) continue` roda antes do ramo do `href`, e
  `idMatch` não-nulo implica `onclick` não-nulo — o `return { type: 'href' }`
  virou código morto. Linha que é só `<a href="...">` sem `onclick` não é mais
  alcançada: com `script` indefinido (o caminho do `sigaa.service.ts:282`) o
  fallback estoura "Link not found and no script provided in fallback", onde
  antes o casamento por texto devolvia o `href` e o `goto` baixava. Não é do
  tema deste ticket; entrou aqui porque é pequeno e ninguém mais o carrega.

#### Revisão (2026-09-16)

Verdict: Needs your call: o critério 5 casa o id contra o `href` cru do DOM, e o
parser guarda o id com a URL já resolvida — a linha de `href` relativo, que é a
razão de o parser ter a resolução, continua inalcançável.

Separação de commits verde: `563d4a6` e `ed465c6` tocam só `tests/`, `2c0070d` e
`99fb241` só `electron/` e `src/`. Nada fora dos Primary files.

Vermelho provado: com os testes de `ed465c6` sobre o código do `master`,
`npx vitest run tests/unit/navigation-policy.test.ts tests/unit/sigaa-service.test.ts
tests/unit/audit-download-fallback-identity.test.ts` dá 6 failed | 103 passed.
Com a correção, `npm run quality` dá 72 arquivos, 793 passed | 5 skipped, ESLint
0 erros / 40 warnings. `npm run test:e2e -- accessibility`: 17 passed (critério 3).

Critérios 1, 2, 3 e 4: ✅.

- 1: `navigation-policy.ts:63-71` segue a ordem que o ticket sugeriu; o teste de
  `http://si3.ufc.br@evil.example/` prende o caso da credencial embutida, e o de
  `http://algo.ufc.br/x` prende o "nunca `trusted`".
- 2: `.btn-open-link` copia campo a campo o `.btn-download-file` (40px, redondo) e
  acrescenta `text-decoration: none`; o bloco `[data-theme="dark"]` espelha o do
  `.btn-download-file`.
- 4: `extractLinkUrl` descarta `hostname === 'si3.ufc.br'`, que é o host do
  `baseUrl` do parser. Literal repetido, mas é o mesmo literal que o resto do
  `electron/` já usa (`download.service.ts:106`, `playwright-login.service.ts`).

Critério 5: ❌. Dois pontos, e o segundo decide o tamanho do primeiro.

1. **O casamento por id não cobre `href` relativo.** O parser monta o id com a
   URL resolvida — `http-scraper.service.ts:282,288`:
   `const url = href.startsWith('http') ? href : this.baseUrl + href`, depois
   `id: \`link:${url}\``. A busca nova compara com o atributo cru:
   `download.service.ts:96`, `id === \`link:${href}\``, e `getAttribute('href')`
   devolve o literal, não a URL resolvida. Para `<a href="/sigaa/ava/xyz.jsf">`
   o id é `link:https://si3.ufc.br/sigaa/ava/xyz.jsf` e o lado direito é
   `link:/sigaa/ava/xyz.jsf`: não casa, a linha é pulada, e o fallback estoura o
   mesmo "Link not found and no script provided" de antes. O teste novo usa
   `href` absoluto, então passa — é o formato que a implementação escolheu, não o
   que o parser produz. A correção é resolver os dois lados igual (ou casar
   também contra `baseUrl + href`) e um teste vermelho com `href` relativo.
2. **Nada chama `downloadFile` com id `link:`.** `course-detail.ts:297-312` não
   renderiza botão de download para `type === 'link'`, e `:468` filtra
   `f.type !== 'link'` antes do "baixar tudo"; no main,
   `sigaa.service.ts:496` pula `matched?.type === 'link'`. Ou seja, o ramo
   `{ type: 'href' }` continua inalcançável em produção mesmo depois do ponto 1.

Por isso "Needs your call": o ponto 1 precisa de teste novo, então pela regra do
loop o stage 3 não conserta — volta ao stage 2. Mas se o ponto 2 fizer você
preferir **apagar** o critério 5 e o ramo `href` em vez de consertá-los, isso é
edição de stage 1, não de stage 2. Os critérios 1–4 estão prontos e não dependem
disso.

- 2026-09-16 Attempt 1 stopped to ask (driver, no run): qual dos dois caminhos do
  bloco de revisão — consertar o casamento por id relativo, ou apagar o critério
  5 e o ramo `href`.

- **Resposta do autor (2026-09-16): apagar.** O ramo é inalcançável hoje
  (`continue` exige `idMatch`, `idMatch` exige `onclick`, então o `return` do
  `href` nunca roda) e não há chamador em produção com id `link:` — o ponto 2 da
  revisão. Consertar o casamento restauraria um caminho que nada alcança.
  Critério 5 reescrito para a deleção; os critérios 1–4 seguem como estão, na
  branch `bug-019`. Stage 2 continua nessa branch.

- **2026-09-16, stage 2, pergunta que trava o ticket:** o ramo `href` de
  `freshAction` que o critério 5 manda apagar é o mesmo que `SEC-004`
  (P0, `Review: human`, fechado 2026-09-15) blindou de propósito —
  `download.service.ts:139-145` (linhas de antes deste ticket) resolve a URL
  contra `page.url()` e só chama `page.goto` se for `https:` + `si3.ufc.br`,
  devolvendo `{ success: false }` no resto. O texto do próprio `SEC-004` chama
  isso de "defesa em profundidade: fecha o ramo antes que `DL-007` (casamento
  por id) o torne alcançável" — ou seja, a blindagem foi escrita justamente
  para o caso deste ticket (id passa a casar `href`), não para o caso em que o
  ramo inteiro some.

  `tests/unit/audit-download-external-url.test.ts` (`New:` em `SEC-004`, não
  listado nos Primary files daqui) exercita esse `if` diretamente — mocka
  `page.evaluate` para devolver `{ type: 'href', value: <url> }` sem passar
  pelo casamento por id — e quebra com a implementação que este ticket pede:
  2 failed (`npx vitest run tests/unit/audit-download-external-url.test.ts`
  com o `freshAction` já simplificado para string).

  A implementação de criterio 5 como está escrita (apagar o ramo inteiro)
  também apaga a checagem `https:` + `si3.ufc.br` que o `SEC-004` tratou como
  bloqueador de release. Isso é escopo que o ticket não nomeia — nenhum Primary
  file daqui cobre `tests/unit/audit-download-external-url.test.ts`, e apagar
  esse teste unilateralmente descartaria uma decisão `Review: human` de outro
  ticket sem a mesma revisão.

  Não implementado: código de `download.service.ts` revertido ao estado do
  `master` (`git checkout -- electron/services/download.service.ts`), sem
  diff pendente. Fica só o commit de teste (`c7faada`, remove o caso de `href`
  absoluto de `audit-download-fallback-identity.test.ts` — esse não colide com
  `SEC-004`, é o teste que o próprio `BUG-019` pediu para sumir).

  Pergunta para o autor: apagar o `href` inteiro (e junto a checagem do
  `SEC-004`, porque não há como manter um `if` sem o ramo em que ele vive), ou
  manter o `if https:`+`si3.ufc.br` como a única coisa que sobra do ramo —
  aceita `freshAction` do tipo `href`, sem o casamento por id ter mudado, só
  não deixa a URL vazar sem checagem enquanto o ramo ainda existe de algum
  jeito? Este ticket, sozinho, não decide revogar uma blindagem P0 de outro.

- **Resposta do autor (2026-09-16): apagar o ramo inteiro, com a trava junto.**
  A objeção estava certa em parar — revogar decisão `Review: human` de um P0 não
  é do stage 2 — mas a blindagem não se perde: ela existe para impedir que o
  `page.goto` daquele ramo saia do `si3.ufc.br`, e sem o ramo não existe `goto`
  nenhum ali. Deletar é estritamente mais forte que checar. O
  `audit-download-external-url.test.ts` fica testando um `freshAction` do tipo
  `href` que o código não produz mais, então sai junto — agora nomeado nos
  Primary files, que era o que faltava para o stage 2 poder tocá-lo.
  O texto do `SEC-004` ("fecha o ramo antes que o `DL-007` o torne alcançável")
  descreve um risco que some com o ramo.

- **2026-09-16, stage 2, criterio 5 implementado (`89a9174`):** o `page.evaluate`
  de `download.service.ts` volta a devolver só o `onclick` (string) quando o id
  casa via JSF, sem o campo `type`. O ramo `href`/`goto`/checagem
  `https:`+`si3.ufc.br` some inteiro; `freshAction` no branch `if` chama o
  script direto, sem `if/else` por tipo.

#### Revisão 2 (2026-09-16)

Verdict: Approve.

Critérios 1–5: ✅. Os critérios 1, 2 e 4 já tinham sido aprovados na revisão
anterior e não mudaram desde então; o que esta revisão fecha é o critério 5,
reescrito como deleção, mais o critério 3 rodado de novo depois do rebase.

**Critério 5** (`5143761`, era `89a9174` antes do rebase). O `page.evaluate` da
busca por id devolve `onclick` cru (string) e o consumidor chama o script direto.
Sumiram: o `return { type: 'href' }`, o `else if (freshAction.type === 'href')`,
o `new URL(..., page.url())`, o `if https:`+`si3.ufc.br` do `SEC-004` e o
`page.goto` que ele protegia. Bate linha a linha com o que o critério manda.

Deletar não abriu buraco, e isto foi verificado, não deduzido do texto do
ticket: depois da remoção sobra **um** `page.goto` em `download.service.ts`
(`:106`, `page.goto(fileUrl)`), e o único chamador de
`DownloadService.downloadFile` passa `fileUrl` **literalmente `''`**
(`playwright-login.service.ts:847-855`). Com `fileUrl` falsy o ramo nunca roda:
o método ficou sem navegação alcançável nenhuma. É estritamente mais forte que a
checagem do `SEC-004`, como o autor previu. O `:106` continua sendo o `CLEAN-010`.

Prova do vermelho, para a parte que é deleção de teste: restaurando
`tests/unit/audit-download-external-url.test.ts` do `master` sobre o código novo,
`npx vitest run tests/unit/audit-download-external-url.test.ts` dá **2 failed** —
os dois casos montam `page.evaluate` devolvendo `{ type: 'href' }`, forma que o
código não produz mais, e o segundo (`navigates when the fresh href resolves to
si3.ufc.br itself`) exige um `page.goto` que não existe. Teste que descreve um
ramo apagado; apagá-lo é a correção, não uma perda de cobertura.

Separação de commits verde no rebase inteiro: `7251c9d`, `f36a02a`, `5338af7` e
`9ab61b1` tocam só `tests/`; `175a5b2`, `a7e2d8c` e `5143761` só `electron/` e
`src/`. Nada fora dos Primary files.

Gate no `master` rebasado (`npm run quality`, Windows): `tsc --noEmit` limpo,
ESLint 0 erros / 40 warnings, vitest **71 arquivos, 796 passed | 5 skipped**.
Critério 3: `npm run test:e2e -- accessibility` **17 passed**, rodado de novo
depois do rebase porque o `master` mexeu em `src/pages/course-detail.ts`.

Nota de rebase: os quatro commits de doc da branch (`9cb1e2e`, `dfa44ad`,
`598bbde`, `b5014ea`) foram descartados — o `master` já tinha o mesmo texto pelo
`bd3e77f`, e replicá-los só gerava conflito. Os sete commits de código e teste
foram preservados um a um.

`Review: human`: o PR fica aberto para você. O `Stage` vai a `done` e a linha do
ledger entra quando você fizer o merge.
