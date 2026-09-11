# DEP-003: Subir o axios para fora da faixa vulnerável
Status: open
Stage: to-review
Priority: P1
Blocked by: nenhum

- Owner: —
- Dependencies: nenhuma. Filho de `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `electron/services/http-scraper.service.ts` (tipos de header quebraram com o axios novo, ver notas)

#### What to build

`axios@^1.13.2` cai na faixa `1.0.0 - 1.17.0` do `npm audit` (high). É a
única dependência de produção com achado; tudo o mais é devDependency ou
transitivo dela. Suba para a menor versão fora da faixa (`1.18.0` ou maior,
`npm view axios version` dava `1.20.0` em 2026-09-11) e regenere o lock no
Windows.

Não há teste unitário que fique vermelho antes e verde depois: a prova é a
saída de `npm audit --omit=dev` antes e depois, colada nas notas abaixo.

#### Acceptance criteria

1. `npm audit --omit=dev` sem high nem critical.
2. `npm ls axios` mostra uma só versão instalada.
3. `npm run quality` verde.
4. Lock regenerado com `npm install` no Windows, `npm ci` limpo depois.

#### Verification

```text
npm audit --omit=dev
npm ls axios
npm run quality
```

#### Implementation notes

- Commit: —
- Versão escolhida: `1.20.0` (`npm view axios version` em 2026-09-11).
- Audit antes/depois (`npm audit --omit=dev`):
  - Antes: 6 high — axios (múltiplos), `electron-updater`→`builder-util-runtime`,
    `form-data`, `js-yaml`, `undici`.
  - Depois: 4 high — axios e `form-data` (transitivo dele) saíram; sobram
    `electron-updater`→`builder-util-runtime`, `js-yaml` e `undici`
    (transitivo de `cheerio`). Nenhum dos três é achado de axios: os dois
    primeiros são escopo de `DEP-006`, `undici`/`cheerio` fica para o
    "audit residual" do passo 7 (`DEP-001`). O critério 1 deste ticket lido
    ao pé da letra ("sem high nem critical") só fecha quando os filhos
    irmãos mergearem — é o que `DEP-001` já registra ("critérios de aceite
    checados uma vez sobre o master"). Tratando o critério como "sem achado
    atribuível ao axios", está cumprido.
- `npm ls axios` → uma só versão, `axios@1.20.0`.
- `npm run quality`: o axios 1.20 muda o tipo de `response.headers[...]` para
  incluir `AxiosHeaders | number | boolean | null` (antes era `string`
  direto). Quebrou 2 erros de tipo em `http-scraper.service.ts` (leitura de
  `content-type`, `content-length`, `content-disposition`). Corrigido com
  `typeof === 'string'` antes de usar — sem `as any`, sem mudar o
  comportamento em runtime (header HTTP de verdade sempre chega como string).
  `npx tsc --noEmit`, `npx eslint .` (0 erros, 62 warnings pré-existentes) e
  `npx vitest run` (633 passed, 4 skipped) verdes depois do `npm ci` limpo.
- Lock regenerado com `npm install` no Windows; `npm ci` depois limpo
  (679 pacotes, sem `install scripts blocked`).
