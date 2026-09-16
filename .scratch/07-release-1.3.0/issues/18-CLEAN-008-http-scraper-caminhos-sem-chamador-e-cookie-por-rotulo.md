# CLEAN-008: `http-scraper`: caminhos sem chamador e cookie por rótulo
Status: open
Stage: implementing
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/http-scraper.service.ts` (`enterCourseHTTP` `:170-248`; ramo sem `preFetchedHtml` de `getCourseFiles` `:269-389`; `getNewsDetail` `:627-761`; regex de extensões em `:437` e `:454`; domínio de cookie em `:90`)
  - `tests/integration/portal-adapter.test.ts` (usa `enterCourseHTTP` como porta de entrada; reescrever contra o adapter)
  - New: `tests/unit/http-scraper-cookie-domain.test.ts`

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
2. `enterCourseHTTP`, o ramo sem `preFetchedHtml` e o `getNewsDetail` do
   `http-scraper` removidos; `portal-adapter.test.ts` passa a exercitar
   `validateCourseListDocument` e vizinhos diretamente (são puros), sem perder
   caso.
3. Uma só constante para a regex de extensões.
4. Domínio de cookie casa por rótulo: `host === domain || host.endsWith('.' + domain)`.
5. Cobertura dos módulos com piso em `vitest.config.ts` não cai (apagar código
   morto não pode reduzir; se reduzir, algum teste cobria só ele e precisa
   virar teste do caminho vivo).
6. `npm run quality` verde.

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

## Comments

- Lição registrada no `CLAUDE.md`: `import ... from` não acha
  `await import()`, e importado não é alcançável. Suba a cadeia até um handler
  IPC, `main.ts` ou teste antes de chamar de morto.
