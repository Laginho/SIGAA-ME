# DEV-002 — Resolve userData paths after the dev isolation `setPath`
Status: resolved
Stage: done
Priority: P2
Dependencies: none (OBS-001 fixes the same defect for `logger.service.ts`)

- Owner: —
- Primary files:
  - `electron/services/cache.service.ts`
  - `electron/services/persistence.service.ts`
  - New: `tests/unit/userdata-late-binding.test.ts`

#### Problem

`electron/main.ts:20-25` calls `app.setPath('userData', '<name>-dev')` when
`!app.isPackaged` to keep development data away from the production folder.
`cacheService` and `persistenceService` are module singletons
(`export const x = new X()`) whose constructors called `app.getPath('userData')`
and read `cache.json` / `settings.json` from disk. ES imports are hoisted, so
both constructors ran before `setPath`. In dev, `cache.json`, `settings.json`
and `credentials.json` were read from and written to the **production**
`userData`. Evidence on the author's machine: `%APPDATA%\sigaa-me-dev` had no
`cache.json`/`settings.json` while `%APPDATA%\sigaa-me` did.

Consequences: a dev sync overwrites the production "already seen" baseline, a
dev "Remember me" writes `credentials.json` into the production folder, and
DATA-002's clear-all in dev deletes production files.

#### Required behavior

- Neither module calls `app.getPath` at import time.
- Every disk access in both services resolves `app.getPath('userData')` at the
  moment of use, so a `setPath` that runs after the import wins.
- The settings/cache in-memory state is loaded on first use, not in the
  constructor. Public API and singleton exports unchanged.

#### Acceptance criteria

- `tests/unit/userdata-late-binding.test.ts`: mock `electron` with a mutable
  `getPath`, import the singletons, assert `getPath` was not called; change the
  returned path; read and write through `cacheService` and `persistenceService`
  and assert the files land only under the new path. Fails at `52aa87a`.
- All existing `cache-service`, `persisted-schemas` and
  `persistence-auth-recovery` tests still pass.
- `npm run quality` green.

#### Out of scope (reported, not changed)

- `logger.service.ts:10` has the same defect; OBS-001 owns it (already lazy on
  branch `obs-001-logging`).
- `http-scraper.service.ts:56` fixes `scraper.log` under `userData` as a class
  field, but that field is evaluated at construction, and the only
  `new SigaaService()` is `main.ts:100` — after the `setPath` block. So
  `scraper.log` already lands in `sigaa-me-dev` and there is nothing to fix
  here. (Corrected in review; the original note claimed `SigaaService` was a
  module singleton, which it is not — see "Achado C-1" below.) OBS-001 removes
  that log entirely anyway.
- `main.ts:28` (`logsDir`) and `main.ts:125` (`userDataPath` passed to the
  handlers) run after the `setPath` block and are correct.

#### Resolution (2026-09-07)

- Decision: both path fields became getters that call `app.getPath` on each
  access; the loaded state became a lazily filled `loaded` field behind a
  getter (`this.loaded ??= this.loadX()`). `clear()`/`reset()` assign
  `loaded` directly. No constructor left in either class. No change to
  `main.ts`, no injection of the path: resolving on use is smaller and keeps
  every existing `new CacheService()` in tests working.
- Files: `electron/services/cache.service.ts`,
  `electron/services/persistence.service.ts`,
  `tests/unit/userdata-late-binding.test.ts`.
- Red-green proof: with `master`'s two service files checked out over the
  branch, the new test fails 3/3 (`getPath` called 3 times at import; cache
  read returns the empty baseline instead of the dev file; settings read
  returns `light` instead of the dev file's `dark`). With the fix, 3/3 pass.
- Gate: `tsc --noEmit` ok; `eslint .` 0 errors, 67 warnings (legacy
  `no-explicit-any`); `vitest run` Test Files 42 passed (42) · Tests 506
  passed | 4 skipped (510). One earlier full run had a single failure in
  `tests/integration/download-real.test.ts` ("traversal no nome do arquivo");
  it does not import either touched module and passed on five isolated reruns
  and on the following full run. Flaky, unrelated, not investigated here.
- Note for the phase ledger: `.scratch/05-fase4-prontidao-para-distribuicao/`
  had no `ledger.md` yet (DEV-001 and DL-002 also had no ledger row). Created
  in review with the three rows.

## Revisão (Opus)

**Zero achados bloqueantes.** Um achado de documentação (classe C), na nota de
fora-de-escopo desta própria issue.

#### Gate, reproduzido aqui

`npm run quality` no worktree da branch: `tsc --noEmit` limpo; `eslint .` 0
erros, 67 warnings (`no-explicit-any` legado); `vitest run` 42 arquivos, 506
passed | 4 skipped. Nenhuma falha em `download-real.test.ts` — a intermitência
citada na resolução não reapareceu.

Vermelho-verde refeito sem confiar no relatório: `git checkout master --` sobre
os dois serviços, `vitest run tests/unit/userdata-late-binding.test.ts` → 3/3
falham (getPath chamado no import; `files: []` em vez de `['1']`; tema `light`
em vez de `dark`). Restaurados os arquivos da branch → 3/3 passam. O item 5 do
"antes de commitar" está cumprido.

#### Cadeia de chamadores

- Consumidores dos dois singletons: `main.ts:8,10,109,121-123,189,222` e
  `background-sync.service.ts:25,60,72,156,159,257,300`. Todos dentro de
  função ou no corpo do `main.ts` **depois** do bloco `setPath`
  (`main.ts:20-25`) — nenhuma chamada em topo de módulo importado, então nada
  força o carregamento preguiçoso antes do `setPath`.
- `register-handlers.ts` recebe `Pick<CacheService, 'clear'>` e um `Pick` da
  `PersistenceService`: só membros públicos, nada que os getters privados
  novos alcancem.
- Nenhum acesso por bracket notation sobrou (`cacheService['cache']`,
  `['settings']`, `['loaded']`): a asserção de `preload-contract.test.ts:107`
  continua verdadeira. Isso importa porque `cache` e `settings` agora são
  acessores **sem setter** — uma atribuição sobrevivente seria TS 2540 e, em
  ESM (strict mode), `TypeError` em runtime. `tsc` limpo confirma que não há.
- `app.getPath` dentro de `loadCache`/`loadSettings`/`saveCache`/
  `saveSettings`/`saveCredentials` está dentro do `try` existente; em `clear`,
  `reset`, `clearCredentials` e `loadCredentials` não está, mas ali a
  propagação é a decisão do DATA-002 e `getPath('userData')` não lança para um
  nome válido. Sem cenário concreto.
- O terceiro consequente que o problema nomeia (clear-all de dev apagando
  produção) fecha de fato: `register-handlers.ts:304-305` chama
  `cache.clear()`/`persistence.reset()`, que agora resolvem o mesmo
  `userData` que o `deps.userDataPath` de `main.ts:126` — os dois lados
  passaram a apontar para a mesma pasta.
- `tests/e2e/clear-all.spec.ts` não é afetado no papel (o launch passa
  `--user-data-dir`, os arquivos são plantados depois do launch e `clear()`
  faz `unlink` independente de o estado ter sido carregado), mas não roda
  daqui — não foi verificado de fato.

#### Achado C-1 — a nota de fora-de-escopo sobre `scraper.log` está errada

"`HttpScraperService` é construído no construtor de `SigaaService`, que também
é um singleton de módulo importado pelo `main.ts`, então o `scraper.log`
também cai na produção em dev."

`sigaa.service.ts` exporta só a classe; `new SigaaService()` existe uma vez, em
`main.ts:100`, que roda **depois** do `setPath` de `main.ts:20-25`. O campo de
classe `http-scraper.service.ts:56` é avaliado na construção, não no import,
logo `scraper.log` já cai em `sigaa-me-dev`. Nada a corrigir no código; a nota
é que precisa cair, senão o OBS-001 age sobre uma premissa falsa. Correção
aplicada nesta revisão.

O outro item de fora-de-escopo está certo: `logger.service.ts:10` é o único
`app.getPath` em tempo de import que sobrou no repo (`grep getPath(` em
`electron/`, `shared/`, `src/`), é singleton de verdade
(`logger.service.ts:64`, importado em `main.ts:11`) e o construtor ainda
*cria* `sigaa-me.log` na produção. É do OBS-001.

#### Veredito

Aprovado. Escopo honesto, diff mínimo (dois campos viraram getters, o estado
virou `loaded` preguiçoso, nada mais), API pública e exports intocados, e a
decisão de resolver no uso em vez de injetar o caminho manteve os
`new CacheService()` dos testes existentes funcionando sem edição.
