# DEP-003: Subir o axios para fora da faixa vulnerável
Status: resolved
Stage: done
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

- Commit: `b29fc46`
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

#### Resolution (2026-09-11)

Revisão da etapa 3 (Opus) sobre `b29fc46`. **Aprovada sem mudança de código.**

Diff dentro do limite: `package.json`, `package-lock.json`,
`electron/services/http-scraper.service.ts` e este ticket — nada fora dos
Primary files.

Critérios, reverificados nesta sessão e não copiados das notas:

1. ✅ com a leitura declarada nas notas. `npm audit --omit=dev` → 4 high,
   nenhum de axios: `builder-util-runtime`/`electron-updater` (`DEP-006`),
   `js-yaml` e `undici` via `cheerio` (passo 7 do `DEP-001`). O critério ao pé
   da letra só fecha sobre o master com os irmãos mergeados.
2. ✅ `npm ls axios` → `axios@1.20.0`, uma só.
3. ✅ `npm run quality` verde: tsc limpo, eslint 0 erros / 62 warnings
   (`no-explicit-any` pré-existentes), vitest 51 arquivos, 633 passed,
   4 skipped.
4. ✅ lock regenerado; `npm ci` limpo. `npm view axios@1.20.0 dependencies`
   bate com o lock (`form-data ^4.0.6`, `proxy-from-env ^2.1.0`,
   `follow-redirects ^1.16.0`, `https-proxy-agent ^5.0.1`).

Sem teste vermelho-verde, como o ticket já previa: a mudança é de versão, e a
prova é a saída do `npm audit`. O ajuste de tipo em `http-scraper.service.ts` é
verificado pelo `tsc` — revertê-lo quebra o typecheck.

Dois pontos olhados de perto e considerados não-achados:

- `contentLength` com `Content-Length: ""`: antes `'' || '0'` dava `0`, agora
  `parseInt('')` dá `NaN`. Os dois usos (`> MAX_DOWNLOAD_BYTES` e `> 0` para o
  progresso) tratam `NaN` e `0` igual, então não há mudança de comportamento.
- Os três `typeof === 'string'` repetidos poderiam virar um helper local. É
  cosmético, o ESLint não reclama, e reescrever código que funciona não é
  trabalho desta etapa.

Um efeito colateral registrado como comentário no `DEP-001`: o axios 1.20
declara `https-proxy-agent@^5` como dependência direta, o que moveu ele e o
`agent-base@6` de dev para produção no lock.
