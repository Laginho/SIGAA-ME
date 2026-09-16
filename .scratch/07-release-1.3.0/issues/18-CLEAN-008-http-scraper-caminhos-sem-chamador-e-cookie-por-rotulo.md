# CLEAN-008: `http-scraper`: caminhos sem chamador e cookie por rótulo
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/http-scraper.service.ts` (`enterCourseHTTP` `:170-248`; ramo sem `preFetchedHtml` de `getCourseFiles` `:269-389`; `getNewsDetail` `:627-761`; regex de extensões em `:437` e `:454`; domínio de cookie em `:90`)
  - `tests/integration/portal-adapter.test.ts` (usa `enterCourseHTTP` como porta de entrada; reescrever contra o adapter)
  - New: `tests/unit/http-scraper-cookie-domain.test.ts`
  - Abertos pelo reopen da revisão (2026-09-15), só para os critérios 7–9:
    - `tests/integration/logging-boundary.test.ts` (`:177-192`)
    - `tests/integration/portal-course-entry.test.ts` (`:142-163`)
    - `electron/sigaa/portal-adapter.ts` (`findCourseRow`, `validateCourseEntryEnd`, `missingViewStateBeforePostMessage`)
    - `electron/sigaa/selectors.ts` (`formByName`)
    - `ARCHITECTURE.md` (`:51`, `:86`)

Slop de um relatório (Fable) mais o item 22 do gabarito (Opus e Fable), no
mesmo arquivo.

#### What to build

Cerca de 330 linhas sem chamador de produção: `enterCourseHTTP` (a decisão em
`plans/README.md` era manter até `BUG-010`, que já fechou), o ramo de
`getCourseFiles` que busca a página quando não recebe `preFetchedHtml`, e o
`getNewsDetail` HTTP (o de produção é o do Playwright, via
`sigaa.service.ts`). A mesma regex de extensões aparece duas vezes.

Item 22: o domínio de cookie é comparado por `endsWith` sem âncora de rótulo;
`notsi3.ufc.br` casaria `si3.ufc.br`. Inócuo com URL fixa, quebra no dia em
que a URL virar configurável.

#### Acceptance criteria

1. Antes de apagar cada método, `grep` mostra zero chamadores fora de
   `tests/`. Se `sigaa.service.ts` ou outro código de produção chamar, o
   método **não** é morto: pare, registre no PR e não apague.
2. ❌ `enterCourseHTTP`, o ramo sem `preFetchedHtml` e o `getNewsDetail` do
   `http-scraper` removidos; `portal-adapter.test.ts` passa a exercitar
   `validateCourseListDocument` e vizinhos diretamente (são puros), sem perder
   caso.
   — Remoções corretas (grep confirmado). O "sem perder caso" caiu: a premissa
   de que os vizinhos são seam viva é falsa. Só `validateCourseListDocument`
   tem chamador de produção (`playwright-login.service.ts:490`);
   `findCourseRow` e `validateCourseEntryEnd` ficaram sem nenhum, e os dois
   testes reescritos apontam para código morto. Vira o critério 9.
3. ✅ Uma só constante para a regex de extensões.
4. ✅ Domínio de cookie casa por rótulo: `host === domain || host.endsWith('.' + domain)`.
5. ❌ Cobertura dos módulos com piso em `vitest.config.ts` não cai (apagar código
   morto não pode reduzir; se reduzir, algum teste cobria só ele e precisa
   virar teste do caminho vivo).
   — O piso numérico segurou (`http-scraper.service.ts` nem está no
   `coverage.include`), mas a intenção da segunda metade falhou fora do
   `portal-adapter.test.ts`. Vira o critério 7.
6. ✅ `npm run quality` verde — 70 arquivos, 771 passed, 5 skipped, 0 erro de
   lint. Verde, mas dois testes agora passam pelo motivo errado (critério 7).
7. `tests/integration/logging-boundary.test.ts:184` e
   `tests/integration/portal-course-entry.test.ts:150` chamam
   `HttpScraperService.getCourseFiles` com dois argumentos. Com
   `preFetchedHtml` obrigatório, `preFetchedHtml.length` (`:184` do serviço)
   lança `TypeError` dentro do `try` e o `catch` devolve `{ success: false }`
   — a asserção passa sem executar nada do que o teste arma. Cada um dos dois
   volta a exercitar o caminho vivo, ou é removido com justificativa escrita.
   O de `logging-boundary` é o grave: ele prova que o cookie de sessão de um
   `AxiosError` nunca vai para o log, e hoje `axios.get` não é mais alcançável
   em `http-scraper.service.ts` (só `axios.post`, em `downloadFile:494`), então
   o `AxiosError` armado nunca é produzido e o `expect(log).not.toContain('SEGREDO123')`
   é vácuo.
8. `ARCHITECTURE.md:51` e `:86` ainda descrevem o `getNewsDetail` HTTP do
   `HttpScraperService`, que este ticket apagou. Atualizar.
9. `findCourseRow`, `validateCourseEntryEnd` (`portal-adapter.ts`),
   `missingViewStateBeforePostMessage` (idem) e `formByName` (`selectors.ts`)
   ficaram com zero chamadores de produção depois da remoção do
   `enterCourseHTTP`. Aplique a eles a mesma regra do critério 1: grep sobe até
   um handler IPC, `main.ts` ou chamador de produção; sem nenhum, apague, e os
   testes de `portal-adapter.test.ts` que os exercitam saem junto.

#### Verification

    npx vitest run tests/integration/portal-adapter.test.ts tests/unit/http-scraper-cookie-domain.test.ts
    npm run coverage
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/http-scraper-cookie-domain.test.ts`: cookie de
  `notsi3.ufc.br` não é aceito para `si3.ufc.br`; `si3.ufc.br` e
  `sub.si3.ufc.br` são. Vermelho no primeiro.
- `portal-adapter.test.ts` reescrito no mesmo commit, verde antes e depois
  (é refactor de teste, não vermelho).

Para o reopen (critérios 7–9):

- `logging-boundary.test.ts:177-192`: o teste de redação do cookie tem que
  falhar se a redação for revertida. Hoje não falha. Aponte-o para um caminho
  que de fato chame `axios` (`downloadFile` usa `axios.post:494`) e prove o
  vermelho revertendo o redator antes de corrigir.
- `portal-course-entry.test.ts:142-163`: a invalidação do `courseData` no
  `catch` (`:430`) continua real, mas a causa armada (`axios.get` rejeitando
  por timeout) não é mais alcançável. Rearme com uma causa que exista.
- Critério 9: antes de apagar `validateCourseEntryEnd`, confira se o caminho
  Playwright de entrada na turma tem validação de estado final própria. Se não
  tiver, isto é uma defesa que nunca foi ligada — registre em `## Comments` em
  vez de apagar em silêncio.

#### Revisão (2026-09-15) — reopen

Verdict: Needs your call: as remoções estão certas e provadas, mas tornar
`preFetchedHtml` obrigatório esvaziou dois testes em arquivos fora do limite —
um deles é a prova de que o cookie de sessão não vai para o log.

Revisado: `sweatshop/2026-09-15-2032...clean-008` (0808978, 13e9853, 60cec6e,
d875e94), eixos Standards e Spec em paralelo.

O que passou:

- Separação de commits correta: `diff --stat` mostra o commit de teste sozinho,
  e nenhum commit de código toca `tests/`.
- Critério 1 e as três remoções: `enterCourseHTTP` e o `getNewsDetail` do
  `http-scraper` tinham zero referências fora das próprias definições;
  `sigaa.service.ts:611` tem o `getNewsDetail` dele, que delega ao
  `playwrightLogin` e continua vivo. Todos os 9+ call sites de
  `httpScraper.getCourseFiles(` em `electron/` passam o terceiro argumento, e
  não há `await import()` deste arquivo — o ramo sem `preFetchedHtml` era
  inalcançável de fato.
- Os dois testes que o commit 0808978 removeu do `portal-adapter.test.ts`
  chamavam `getCourseFiles` com dois argumentos: cobriam só o ramo apagado.
  Remoção correta, não é perda.
- Critérios 3, 4 e 6.

O que falhou, e é o que sobra para a etapa 2: critérios 7, 8 e 9 acima.

O `npm run quality` verde não pegou nada disso porque o `tsconfig.json` só
inclui `src`, `electron` e `shared` — `tests/` nunca passa pelo `tsc`, então a
chamada com aridade errada compila, e o `TypeError` que ela gera cai no `catch`
genérico do próprio método. É o padrão do `QA-003` de novo: teste verde por
cima de asserção que não executa mais nada.

## Comments

- Lição registrada no `CLAUDE.md`: `import ... from` não acha
  `await import()`, e importado não é alcançável. Suba a cadeia até um handler
  IPC, `main.ts` ou teste antes de chamar de morto.
- A mensagem do commit 0808978 diz que os puros do `portal-adapter` são "the
  real production seam (also used by playwright-login.service.ts)". Vale só
  para `validateCourseListDocument`. Corrija a afirmação no commit do reopen.
- `cookie.domain` chega ao `setCookies` por dois caminhos com normalização
  diferente: o parser de `Set-Cookie` tira o ponto inicial
  (`http-scraper.service.ts:144`), o `context.cookies()` do Playwright
  (`playwright-login.service.ts:171,256`) passa direto e pode trazer
  `.si3.ufc.br`. Contra um domínio com ponto o `cookieDomainMatches` devolve
  `false` para qualquer host — mas o `endsWith` antigo também devolvia `false`
  para o host apex, que é o único que a `baseUrl` fixa usa. Não é regressão
  deste ticket; é lacuna anterior. Vale ticket próprio se a URL virar
  configurável, junto com o critério 4.
- `tests/` fora do `include` do `tsconfig.json` é o que deixou a aridade errada
  passar. Mudar isso é maior que este ticket e é `CLEAN-*` próprio.
