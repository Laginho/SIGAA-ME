# BUG-019: Link `http://` renderiza um controle que não abre nada
Status: open
Stage: to-implement
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
5. A busca da linha viva por id em `download.service.ts` volta a alcançar linha
   só com `href`. Independe da resposta em `## Comments`.

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
- Critério 5 — `tests/unit/audit-download-fallback-identity.test.ts`: linha com
  `href` e sem `onclick` é alcançada pelo id e vira `goto`. Vermelho porque hoje
  o `continue` do id passa por ela.

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
