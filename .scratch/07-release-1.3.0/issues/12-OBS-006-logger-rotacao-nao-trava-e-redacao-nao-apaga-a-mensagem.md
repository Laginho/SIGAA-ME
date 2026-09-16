# OBS-006: Logger: rotação não trava e redação não apaga a mensagem
Status: open
Stage: implementing
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `electron/services/logger.service.ts` (`HTML_RE` `:35` e uso em `:52`; `rotate` `:265-280`)
  - `tests/unit/logger-redaction.test.ts`
  - New: `tests/unit/logger-rotate.test.ts`

Itens 10 (Astra) e 20 (Fable) do gabarito.

#### What to build

Item 10: `rotate()` é `new Promise` sem `reject`. `unlinkSync`/`renameSync`
dentro do callback de `stream.end` escapam, `resolve` nunca roda, `writeLine`
trava em `await this.rotate()` e o erro vira `uncaughtException`. Um arquivo
de log travado por outro processo (antivírus, editor aberto) derruba o app.

Item 20: `HTML_RE = /<[a-zA-Z!][\s\S]*$/` apaga do primeiro `<`+letra até o
fim da linha. `expected <string> but got undefined` vira
`expected [html omitted]`; o diagnóstico some.

#### Acceptance criteria

1. Erro em `unlink`/`rename` dentro de `finish` não escapa: a promise de
   `rotate()` resolve, o stream é reaberto e a próxima linha é gravada. O erro
   é registrado uma vez pelo caminho que o próprio logger já usa para falha
   interna (não pelo `log.*` que chamaria `rotate` de novo).
2. Redação de HTML remove tag a tag (`<tag …>`, `</tag>`, `<!-- … -->`); o
   texto fora das tags permanece; uma linha com um só `<...>` mantém tudo
   depois dele. O corte em `MAX_LINE_CHARS` continua sendo o teto.
3. Os casos existentes de `logger-redaction.test.ts` (senha, cookie, auth,
   ViewState, JSF, caminho) continuam verdes.
4. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/logger-redaction.test.ts tests/unit/logger-rotate.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/logger-rotate.test.ts` (diretório temporário; `maxBytes`
  pequeno para forçar rotação): com `app.1.log` substituído por um diretório
  (faz `renameSync` lançar), `writeLine` seguinte resolve dentro de um
  timeout curto e o arquivo novo recebe a linha. Vermelho porque hoje a
  promise fica pendente.
- `tests/unit/logger-redaction.test.ts`: `redact('expected <string> but got 5')`
  preserva `but got 5`; `redact('<div class="x">oi</div> fim')` remove as
  tags e mantém `oi` e `fim`. Vermelho no primeiro.

## Comments

- O motivo original do `HTML_RE` era não despejar página inteira no log. Com
  remoção tag a tag, um dump vira só o texto da página e o `MAX_LINE_CHARS`
  corta; é o compromisso escolhido.
