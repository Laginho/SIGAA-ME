# CLEAN-007: Cortes pequenos, um commit cada
Status: resolved
Stage: done
Priority: P3
Blocked by: nenhum
Review: agent

- Primary files:
  - `package.json`, `package-lock.json` (`sqlite`; ver Comments sobre o lock)
  - `shared/ipc.ts` (`:81-82` `autoSync`), `electron/services/persistence.service.ts` (`:21`, `:42`), `electron/ipc/validation.ts` (caso `autoSync`, se existir) e as fixtures de settings nos testes que citam `autoSync` (dez arquivos em `tests/`; só o campo)
  - `src/styles/sync-selection.dark.css` (apagar)
  - `src/pages/course-detail.ts` (`:336-338` `cleanupProgress`; leituras repetidas de `courses` em `:80-82`, `:94-97`, `:177-178`, `:536-537`, `:567-568`)
  - `src/utils/ui-helpers.ts` (`:53-54`, mesma leitura repetida)
  - `src/data/account-storage.ts` (destino do helper de leitura de `courses`)
  - `electron/services/download.service.ts` (`:30` parâmetro `_browser`; `:246` `catch` vazio)
  - `electron/services/background-sync.service.ts` (`:49-51` `restart()`), `electron/ipc/register-handlers.ts` (`:58`, `:279`)
  - `electron/main.ts` (`:154` `additionalArguments: ['--sigaa-dev']`)
  - `src/utils/notification-store.ts` (`:127` `clearAllNotifications`), `tests/unit/dashboard-listener.test.ts` (único chamador)
  - `tests/unit/ui-helpers.test.ts` ou `tests/unit/account-storage.test.ts` (teste do helper novo)

Seção Slop do relatório mesclado: itens de concordância ampla e cortes de um
relatório que não tocam scraper. Cada corte é um commit; gate verde entre eles.

#### What to build

Dívida catalogada pelos quatro relatórios, sem risco de comportamento: uma
dependência de produção sem import, um campo de settings declarado e nunca
lido, um CSS sem import, um estado global em `window as any`, seis cópias da
mesma leitura de cache, um construtor com parâmetro ignorado, um `catch`
vazio, um wrapper de identidade, um argumento de linha de comando que ninguém
lê e uma função só usada em teste.

#### Acceptance criteria

Cada item é um commit `chore:`/`refactor:` próprio, gate verde em cada um:

1. `sqlite` sai de `dependencies`; lock regenerado no Windows.
2. `autoSync` sai de `AppSettings`, dos padrões, dos validadores e das
   fixtures de teste; nenhum leitor sobra (não havia).
3. `src/styles/sync-selection.dark.css` apagado; nenhum import quebrado.
4. `cleanupProgress` vira `let` de módulo em `course-detail.ts`; zero
   `(window as any)` no arquivo.
5. Leitura de `courses` do storage passa por um helper em
   `account-storage.ts` que parseia, valida que é array e devolve `[]` no
   erro; os seis pontos usam o helper (fecha a nota do `DATA-005`).
6. `download.service.ts`: `_browser` removido do construtor e dos chamadores;
   o `catch` de `:246` ou trata o erro ou o `try` some.
7. `restart()` removido; `register-handlers.ts:279` chama `start()`; o
   `Pick<>` em `:58` ajustado.
8. `--sigaa-dev` removido de `additionalArguments` depois de confirmar por
   `grep` que nem preload nem teste leem; se algo lê, o item vira nota no PR
   em vez de corte.
9. `clearAllNotifications` removido; o teste que a usava limpa o storage
   diretamente.
10. `npm run quality` verde no último commit; contagem de warnings de lint não
    sobe.

#### Verification

    git log --oneline master..HEAD        # um commit por item
    npm run quality

## Tests stage 2 writes (own commit, red)

- Teste do helper do item 5: storage com `courses` = `'{}'` devolve `[]`;
  array válido devolve o array. Vermelho porque o helper não existe.
- Os outros itens são remoção; o gate é a prova.

## Comments

- `npm uninstall sqlite` precisa rodar no Windows (binários nativos; ver
  `CLAUDE.md`, "npm install roda no Windows"). Se a etapa 2 rodar em Linux,
  edita o `package.json` e deixa o lock para o autor regenerar antes do
  merge, dizendo isso no PR.
- Da revisão do `DATA-005` (2026-09-15): o índice `downloads` é parseado solto
  em `course-detail.ts` `:243`, `:269` e `:458`, três cópias de
  `JSON.parse(readAccountItem('downloads') || '{}')`. O `|| {}` do
  `downloads[courseId]` já absorve array, string e entrada de turma inválida
  sem lançar, então não é bug hoje; o que lança é `downloads = 'null'`, que
  nenhum escritor produz. Se o item 5 render um helper de leitura validada,
  vale um irmão para `downloads` e as três cópias somem. Não é critério novo.

- `playwright-login.service.ts` e `http-scraper.service.ts` têm tickets
  próprios (`CLEAN-009`, `CLEAN-008`); não toque neles aqui.

### Notas da implementação (2026-09-15)

- Item 5: além dos seis pontos listados, `testDownloadAll` (`course-detail.ts`)
  tinha um sétimo `JSON.parse(readAccountItem('courses') || ...)` idêntico,
  não citado no ticket original (drift de linha desde que foi escrito). Migrado
  para `readCoursesCache()` também — mesmo arquivo, mesmo padrão, sem seam novo.
- Item 6: remover o parâmetro `_browser` do construtor exige ajustar todo
  chamador. Único chamador de produção é `playwright-login.service.ts:755`
  (`new DownloadService(localBrowser)` → `new DownloadService()`), uma linha —
  não é o refactor mais amplo que `CLEAN-009` cobre, então não conflita com a
  nota acima. Os seis chamadores de teste (`download-boundary.test.ts`,
  `logging-boundary.test.ts`, `audit-download-fallback-identity.test.ts`,
  `audit-download-inspect.test.ts`) tiveram só o `null` removido da chamada.
- Item 7: `Pick<>` sem `restart` quebrou o mock de
  `tests/unit/ipc-validation.test.ts` (`backgroundSync: { restart: vi.fn() }`
  e duas asserções sobre ele) — trocado por `start`, mesmo teste, mesma
  asserção de comportamento.
- Item 8: **não cortado**, virou nota. `--sigaa-dev` não é lido por
  `preload.ts` (autoridade real é `SIGAA_DEV_BRIDGE` em `process.env`, como o
  comentário do preload já diz), mas
  `tests/integration/dev-cache-mutation-boundary.test.ts` lê o valor de
  `additionalArguments` do `main.ts` de verdade (`bootMain` devolve
  `options.webPreferences?.additionalArguments` e usa isso para montar o
  `process.argv` do preload em seguida, e a última asserção do teste é
  `expect(productionArgs).not.toContain('--sigaa-dev')`). Pela própria regra do
  critério 8 ("se algo lê, o item vira nota"), isto conta como leitura — o
  corte fica para quem quiser reescrever esse teste antes.

Gate final: `npm run quality` verde — typecheck limpo, 770 testes (5 skipped),
48 warnings de lint (baseline era 52, não subiu).

#### Resolution (2026-09-15)

Verdict: Approve

Dez commits, um por item, na ordem do ticket; nada fora dos Primary files. Cada
critério conferido contra o código, não contra o relatório da etapa 2:

1. ✔ `sqlite` fora de `dependencies`; lock regenerado no Windows (o `npm ci` é
   autoritativo, `DEP-002`). `grep -r sqlite` em `.ts`/`.json` de fonte: zero.
2. ✔ `autoSync` fora de `AppSettings`, de `DEFAULT_SETTINGS`, de `VALIDATORS` e
   do `Exclude<>` de `RendererSettingKey`; dez fixtures de teste limpas. Nenhum
   leitor sobrava. **Sem migração necessária:** `loadSettings` itera
   `Object.keys(VALIDATORS)` (allowlist, `DATA-001`), então um `settings.json`
   de usuário antigo com `autoSync` é ignorado em silêncio, não rejeitado.
3. ✔ `src/styles/sync-selection.dark.css` apagado; nenhuma referência em
   fonte — só em docs de auditoria e em tickets antigos.
4. ✔ `cleanupProgress` é `let` de módulo (`course-detail.ts:11`); `grep -c
   'window as any'` no arquivo: 0.
5. ✔ `readCoursesCache()` em `account-storage.ts:108`, e os sete pontos passam
   por ele. Vermelho provado: em `42e2879` (commit só de teste) o
   `account-storage.ts` não tem a função — `git show 42e2879:src/data/account-storage.ts
   | grep -c readCoursesCache` = 0, o import do teste não resolve.
6. ✔ `_browser` fora do construtor; o único chamador de produção
   (`playwright-login.service.ts:755`) e os seis de teste ajustados. O `catch`
   da rota do popup agora só engole quando o `route.continue()` de recuperação
   funciona; se ele também falhar, sai `log.warn` com os dois erros — o
   tratamento é o `continue()`, não o log, então não recai na regra 3 do
   `CLAUDE.md`.
7. ✔ `restart()` removido; `register-handlers.ts:279` chama `start()`, que
   começa com `this.stop()` (`background-sync.service.ts:32`) — wrapper de
   identidade confirmado, comportamento idêntico. `Pick<>` de `:58` sem
   `restart`.
8. Não cortado, e a nota está certa: `tests/integration/dev-cache-mutation-boundary.test.ts:167`
   lê o `additionalArguments` do `main.ts` de verdade e afirma sobre ele, e
   `tests/unit/preload-dev-gate.test.ts` monta `process.argv` com a flag. Pela
   cláusula do próprio critério ("se algo lê, vira nota"), fica para quem
   reescrever esses testes.
9. ✔ `clearAllNotifications` removido; `removeAccountItem` saiu do import de
   `notification-store.ts`; o teste limpa o storage direto.
10. ✔ `npm run quality` verde no Windows: typecheck limpo, ESLint 0 erros /
    48 warnings (baseline 52), vitest 69 arquivos, 770 passed | 5 skipped.

Separação de commits verificada por `diff --stat`: `42e2879` toca só o teste e
o ticket; os nove commits de código seguintes tocam teste apenas onde o próprio
ticket listou como Primary file (fixtures de `autoSync`, chamadores de
`DownloadService`, mock de `restart`, o teste de `clearAllNotifications`).

Duas observações, nenhuma bloqueante e nenhuma corrigida aqui:

- `isNewsCached` perdeu o `try/catch` que devolvia `false`. Com `courses`
  válido mas `course.news` sendo objeto em vez de array, o `.find` lançaria, e
  agora a exceção sobe de `openNewsModal` (a chamada em `:508` está fora do
  `try`) em vez de virar `false`. **Inalcançável hoje:** o único escritor,
  `mergeCoursesIntoCache`, faz `for (const n of course.news)` três vezes antes
  do `writeAccountItem`, então essa forma nunca chega ao storage. Não vale um
  `try/catch` de volta sem um escritor que a produza.
- `fetchCourseFiles` (`:166`) e `testDownloadAll` lêem `courses` duas vezes: um
  `readAccountItem` como sentinela de "sem cache nenhum" e depois o helper. É
  de propósito — preserva a mensagem "Dados não encontrados" distinta de
  "Disciplina não encontrada". Custo é um `localStorage.getItem` extra.

Merge: `e8fa279`, `--no-ff` na branch de sessão `sweatshop/2026-09-15-2032`.
