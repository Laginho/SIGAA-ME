# DATA-003: Escrita engolida em settings e cache
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum

- Primary files:
  - `electron/services/persistence.service.ts` (`updateSetting`, `applySetting`, `saveSettings`)
  - `electron/services/cache.service.ts` (`updateCourseState` e quem mais chama `saveCache`; `saveCache`)
  - `electron/ipc/register-handlers.ts` (handlers `update-app-setting` `:240-257`
    e `select-download-folder` `:155-171`)
  - `electron/services/background-sync.service.ts` (só as chamadas `:263` e `:306`
    e a ordem delas)
  - `tests/unit/cache-service.test.ts` e os testes existentes de persistência (só se o contrato mudar o que já é asserido)
  - New: `tests/unit/audit-persistence.test.ts`

Regra 3 do `CLAUDE.md` na origem: `try/catch` que só faz `log.error`.

#### What to build

Quando salvar `settings.json` ou `cache.json` falha, o chamador sabe. Hoje
`saveSettings`/`saveCache` capturam e logam; `updateSetting`/`applySetting`
mutam `this.settings` **antes** de salvar; e o handler `update-app-setting`
devolve `ok()` de qualquer jeito. A configuração parece salva e some no
próximo boot.

#### Acceptance criteria

1. Com `fs.writeFileSync` lançando `ENOSPC`, `PersistenceService.applySetting`
   e `updateSetting` **lançam** com essa mensagem e `getSettings()` devolve o
   valor anterior (a mutação em memória não sobrevive à escrita falhada).
2. Nas mesmas condições, `CacheService.updateCourseState` lança e
   `getCourseState` devolve o estado anterior.
3. O handler `update-app-setting` devolve `fail('STORAGE', ...)` quando a
   escrita falha, em vez de `ok()`, e não reinicia o `backgroundSync` nesse
   caso.
4. `saveSettings`/`saveCache` não têm mais `try/catch` que só loga, e nenhum
   chamador deles passa a engolir o erro por conta própria (grep no diff pelo
   revisor).
5. `select-download-folder` devolve `fail('STORAGE', ...)` quando `updateSetting`
   lança, em vez de rejeitar a `invoke`: o contrato do canal é a união
   `AppResult`, não uma promise rejeitada.
6. `CacheService.forgetLastFile` grava antes de mutar, como o `commit` documenta:
   com a escrita falhando, o id esquecido continua em `getCourseState`.
7. Uma falha ao gravar `lastBackgroundSync` não descarta o push ao renderer nem
   as notificações daquele ciclo de sync, e a decisão sobre os dois chamadores
   em `background-sync.service.ts` está anotada em `## Comments`.

#### Verification

    npx vitest run tests/unit/audit-persistence.test.ts tests/unit/cache-service.test.ts tests/unit/ipc-validation.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `git checkout 19ba8aa -- tests/unit/audit-persistence.test.ts` (critérios 1
  e 2). `c550fd1` criou o arquivo e `19ba8aa` ajustou 2 linhas; a versão de
  `19ba8aa` é a final. Reprovar contra o master de hoje.
- Critério 3: teste novo em `tests/unit/ipc-validation.test.ts` ou arquivo
  próprio — `persistence.applySetting` mockado lançando, handler devolve
  `success: false` com código `STORAGE` e `backgroundSync.restart` não é
  chamado.

## Comments

- Verifique quem mais chama `saveSettings`/`saveCache` (`grep`) antes de
  tirar o `try`: um chamador em caminho de boot que passa a lançar derruba o
  main. Se houver, decida caso a caso e anote aqui; não reintroduza o `catch`
  silencioso.

#### Revisão etapa 3 (2026-09-11) — reaberto

Gate verde no commit `485e38d`: `npm run quality` limpo, 52 arquivos,
638 passed | 4 skipped. Red-green conferido trocando só `electron/` pelo
merge-base: 4 testes falham (audit-persistence 2, cache-service 1,
ipc-validation 1) e passam com a mudança. Separação teste/código correta nos
três commits.

Critérios 1, 2 e 3 ✅. Critério 4 ❌ parcial — os `try/catch` que só logavam
saíram, mas o grep de chamadores que o próprio ticket pedia não foi feito, e
três pontos ficaram inconsistentes com o invariante que o `commit` documenta:

- ❌ **`select-download-folder` sem guarda** (`register-handlers.ts:169`).
  `updateSetting('lastDownloadPath', ...)` agora lança e nada captura: o
  `handle()` não tem `try`, então a `invoke` rejeita em vez de devolver a união
  `AppResult` que todo handler do arquivo devolve. Irmão direto do
  `update-app-setting` que foi corrigido — mesma origem, um call site tratado e
  outro não. Vira o critério 5.
- ❌ **`forgetLastFile` muta antes de gravar** (`cache.service.ts:157-166`).
  `state.files.pop()!` altera o objeto que `this.loaded` referencia e só depois
  chama `this.commit(this.cache)`. Com a escrita falhando, o id já sumiu da
  memória — o oposto do que o docstring do `commit` promete. Dev-only, mas é a
  mesma classe e o mesmo ticket. Vira o critério 6.
- ❌ **Chamadores do `background-sync` não decididos nem anotados.** O
  `## Comments` mandava conferir quem mais chama `saveSettings`/`saveCache` e
  registrar a decisão caso a caso; o commit só mudou a linha `Stage:`. São dois:
  `updateSetting('lastBackgroundSync', ...)` (`:263`) e `updateCourseState`
  (`:306`). O `:306` está aceitável — o `catch` do método já é descrito como
  load-bearing e o efeito é re-diff no próximo ciclo. O `:263` não: ele roda
  **antes** do push ao renderer e das notificações, então um `ENOSPC` numa
  escrita de setting agora descarta a UI e as notificações do ciclo inteiro,
  onde antes só logava. Vira o critério 7.

Nenhum dos três cabe em correção de revisor: todos precisam de teste novo, e o
`:263` fica fora do limite original. Por isso o ticket volta para
`to-implement`, com `Primary files` estendido e os critérios 5-7. O trabalho
continua na branch `data-003` — os critérios 1-3 já estão prontos e testados,
não refaça.

Fora do escopo, não bloqueia: `tests/unit/sync-selection.test.ts` falha de forma
intermitente na suíte cheia sob carga (`expect(window.location.hash).not.toBe(
'#/dashboard')`, `:300`), inclusive com `electron/` no merge-base. Aberto como
QA-008.
