# QA-005 — Apagar o parser espelhado em vez de mantê-lo
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado na sessão 2026-08-05

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: `QA-004`
- Primary files: `tests/unit/parser.test.ts` (**apagado**),
  `tests/integration/parser-real.test.ts`

#### Por que esta tarefa existe

A outra metade da correção de raiz. `tests/unit/parser.test.ts` mantinha uma
cópia do parser dentro do próprio arquivo de teste — 11 testes verdes sobre
código que não é o de produção. Foi o que permitiu o `BUG-007` passar.

Manter as duas coisas seria manter o problema: enquanto a cópia existe, ela pode
voltar a divergir, e um verde nela continua não significando nada.

#### Fix

Arquivo apagado (241 linhas). As asserções que valiam a pena foram para
`parser-real.test.ts`, que chama o `HttpScraperService` de verdade:

| Asserção da cópia | Destino |
|---|---|
| nomes de arquivo, página vazia, títulos de notícia | já existiam no `parser-real` |
| ids de arquivo (`555`/`556`) | **trazida** — e revelou o `BUG-009` |
| ids de notícia exatos (`777`/`778`), data | **trazidas** |
| 2 testes de ViewState | **descartados** — afirmavam que o cheerio lê um atributo de um literal declarado no mesmo arquivo; não exercitavam código do projeto |

Saldo: 11 testes que não provavam nada → 4 testes sobre o código de produção.
A suíte caiu de 76 para 64, e cobre estritamente mais.

#### Rationale

Teste que espelha implementação é pior que teste ausente: ausente não mente.
