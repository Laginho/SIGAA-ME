# CLEAN-010: Parâmetro `fileUrl` morto leva a um `page.goto` sem checagem
Status: open
Stage: to-implement
Priority: P3
Blocked by: BUG-019
Review: agent

- Primary files:
  - `electron/services/download.service.ts` (assinatura de `downloadFile` e o
    ramo de fallback em cache, `:112-124`)
  - `electron/services/playwright-login.service.ts` (a única chamada, `:847`)
  - `tests/integration/download-boundary.test.ts`
  - `tests/unit/audit-download-inspect.test.ts`
  - `tests/unit/audit-download-fallback-identity.test.ts`

Achado durante a revisão da pergunta do `BUG-019` (2026-09-16), enquanto se
conferia se apagar o ramo `href` tirava alguma trava de navegação. Não tira — mas
mostrou a navegação vizinha, que nunca teve trava nenhuma.

#### What to build

`DownloadService.downloadFile` recebe `fileUrl: string` como segundo parâmetro.
O único chamador de produção passa string vazia:

    // playwright-login.service.ts:847
    const result = await downloadService.downloadFile(
        page,
        '',
        fileName,
        ...

Com isso o ramo que consome esse parâmetro é inalcançável:

    // download.service.ts:119-121
    } else if (fileUrl && !fileUrl.includes('javascript:')) {
        await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });

Duas coisas ao mesmo tempo, e é por isso que este ticket não é só cosmética: o
parâmetro é morto **e** a navegação que ele habilita não checa protocolo nem
host — só recusa a substring `javascript:`. É a mesma classe de risco que o
`SEC-004` fechou no ramo `href` ao lado, exceto que aqui ninguém fechou porque
ninguém alcança. Apagar resolve os dois de uma vez, e é diff menor que
acrescentar a checagem.

Depois da deleção, `freshAction` nulo com `script` ausente cai direto no `throw`
que já existe — o comportamento de hoje, já que o ramo nunca roda.

**Depende do `BUG-019`**, que apaga o ramo `href` no mesmo bloco `if
(freshAction)`. Fazer os dois em paralelo é conflito garantido no mesmo trecho.

#### Acceptance criteria

1. O parâmetro `fileUrl` sai da assinatura de `DownloadService.downloadFile`, e
   o `''` sai da chamada em `playwright-login.service.ts`. Nenhum chamador passa
   a depender de posição de argumento errada — o `tsc` prova.
2. O ramo `else if (fileUrl && !fileUrl.includes('javascript:'))` e o
   `page.goto(fileUrl)` dentro dele são apagados. O `else { throw new
   Error('Link not found and no script provided in fallback') }` passa a ser o
   `else` do `if (script)`.
3. Nenhum `page.goto` sem checagem de protocolo e host sobra em
   `download.service.ts`. Confirmação: `grep -n 'page.goto' electron/services/download.service.ts`
   não devolve nada fora de navegação para host fixo escrito no código.
4. Os testes que chamam `downloadFile` passando a URL posicionalmente são
   ajustados à assinatura nova, no commit de teste.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/integration/download-boundary.test.ts tests/unit/audit-download-inspect.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- Nenhum teste novo: é deleção de parâmetro e de ramo sem chamador. O commit de
  teste só ajusta as chamadas existentes de `downloadFile` à assinatura nova
  (`tests/integration/download-boundary.test.ts`,
  `tests/unit/audit-download-inspect.test.ts`,
  `tests/unit/audit-download-fallback-identity.test.ts`). Vermelho por
  compilação: com a assinatura antiga, a chamada nova não tipa.

## Comments

- O `SEC-004` (P0, 2026-09-15) travou o `goto` do ramo `href` vizinho contra
  `https:` + `si3.ufc.br`. Este `goto` ficou de fora daquela varredura porque
  está no `else`, no caminho do script em cache. O `BUG-019` apaga o do `href`;
  este apaga o que sobrou.
