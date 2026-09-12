# DATA-003: Escrita engolida em settings e cache
Status: open
Stage: implementing
Priority: P2
Blocked by: nenhum

- Primary files:
  - `electron/services/persistence.service.ts` (`updateSetting`, `applySetting`, `saveSettings`)
  - `electron/services/cache.service.ts` (`updateCourseState` e quem mais chama `saveCache`; `saveCache`)
  - `electron/ipc/register-handlers.ts` (handler `update-app-setting`, `:240-257`)
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
