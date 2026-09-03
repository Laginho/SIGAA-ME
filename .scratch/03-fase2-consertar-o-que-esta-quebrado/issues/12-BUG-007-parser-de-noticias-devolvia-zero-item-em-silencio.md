# BUG-007 — Parser de notícias devolvia zero item, em silêncio
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — corrigido na sessão 2026-08-05

- Owner: Claude
- Dependencies: none
- Primary files: `electron/services/http-scraper.service.ts`,
  `tests/integration/parser-real.test.ts`

#### Problem

Uma das estratégias de extração de notícia casava o id assim:

```ts
const idMatch = onclick.match(/['"](\\d+)['"]/)
```

Dentro de um literal de regex, `\\d` é **barra invertida seguida da letra d**,
não "um dígito". A expressão nunca casava. A estratégia devolvia zero notícia e
não registrava erro — o app simplesmente mostrava a turma sem avisos.

Havia 14 testes verdes em cima disso. Eles passavam porque
`tests/unit/parser.test.ts` testa uma **cópia** do parser mantida dentro do
próprio teste, e a cópia não tinha o defeito.

#### Fix

O id vem do `onclick` do JSF na forma `...,id,777,...`, então o padrão correto é
`/,id,([^,'"]+)/`. O comentário acima da linha explica o escape duplo, para que a
próxima pessoa não o reintroduza.

#### Verificação

`tests/integration/parser-real.test.ts` chama `getCourseFiles()` de verdade com
`preFetchedHtml` e afirma `result.news.every(n => !!n.id)`. Esse teste falha se a
correção for revertida — regra 5 do `CLAUDE.md` cumprida.

#### Por que registrar isto

É o caso mais claro do repositório de **suíte verde que não protege nada**: o
teste e o código sob teste eram arquivos diferentes. Ver `QA-004` para a regra
que saiu daqui.
