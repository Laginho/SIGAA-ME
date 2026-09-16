# OBS-006: Logger: rotação não trava e redação não apaga a mensagem
Status: resolved
Stage: done
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

#### Resolution (2026-09-15)

Verdict: Approve

Commits: `33e086d` (testes, vermelho), `573979e` (correção), merge `83dc405`.

Decisão. `rotate()` envolve o laço `unlink`/`rename` num `try/catch` que
registra por `console.error` — o mesmo caminho do `onSinkFailure`, escolhido
porque `this.error` chamaria `rotate()` de novo. O `openStream()`, o
`this.bytes = 0` e o `resolve()` ficaram fora do `try`, então a promise resolve
em qualquer caso e o `writeLine` seguinte grava. `HTML_RE` virou
`/<!--[\s\S]*?-->|<\/?[a-zA-Z!][^<>]*>/g` com substituição por string vazia:
casa uma tag ou um comentário por vez em vez de consumir até o fim da linha.

Arquivos: `electron/services/logger.service.ts` (`:35`, `:52`, `:263-289`),
`tests/unit/logger-redaction.test.ts`, `tests/unit/logger-rotate.test.ts` (novo).
Nada fora dos Primary files. Commit de teste e commit de código separados, sem
sobreposição de arquivos no `diff --stat`.

Vermelho sem a correção (`git checkout 33e086d~1 -- electron/services/logger.service.ts`):

    Test Files  2 failed (2)
         Tests  3 failed | 24 passed (27)
        Errors  1 error
    Uncaught Exception: EPERM: operation not permitted, unlink '…\logs\app.1.log'
      ❯ Array.finish electron/services/logger.service.ts:271:47

Ou seja: a exceção escapa do callback do `stream.end`, `rotate()` nunca
resolve, e o teste novo morre no timeout de 2s. As duas asserções de redação
falham junto.

Verde com a correção, gate completo (`npm run quality`):

    ✖ 52 problems (0 errors, 52 warnings)
    Test Files  69 passed (69)
         Tests  761 passed | 5 skipped (766)

Critérios 1 a 4: todos atendidos.

Observações que não bloqueiam e não viraram ticket:

- `[^<>]*` não casa `>` dentro de valor de atributo (`<a title="a>b">` deixa
  resto), e tag não fechada no fim da linha não é removida. Cosmético: sobra
  texto, não segredo.
- Corpo de `<script>`/`<style>` agora sobrevive à remoção das tags. Busca no
  `electron/` e no `src/` não achou **nenhum** chamador que passe HTML de
  página ao logger: os ~11 pontos de captura em `playwright-login.service.ts` e
  `http-scraper.service.ts` vão para `diagnosticsService.saveRaw`, e os `log.*`
  vizinhos registram só `length`/`contentLength`. Some-se o `CONTENT_KEYS`
  (`html`, `body`, `script` viram `[redacted]` em produção) e o risco é
  teórico. É o compromisso já registrado abaixo.

## Comments

- O motivo original do `HTML_RE` era não despejar página inteira no log. Com
  remoção tag a tag, um dump vira só o texto da página e o `MAX_LINE_CHARS`
  corta; é o compromisso escolhido.
