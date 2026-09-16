# CLEAN-007: Cortes pequenos, um commit cada
Status: open
Stage: to-review
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
