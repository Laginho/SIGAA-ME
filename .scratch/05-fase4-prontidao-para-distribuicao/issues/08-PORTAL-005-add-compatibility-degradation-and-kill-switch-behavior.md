# PORTAL-005 — Kill-switch de compatibilidade: estado no main, sync pausado
Status: open
Stage: to-implement
Priority: P1
Blocked by: OBS-003
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `PORTAL-001`, `CONC-001`, `OBS-003` (mesmo `IpcDeps` e mesmo
  `clear-all-data.test.ts`; em paralelo daria conflito de merge)
- Primary files:
  - New: `electron/services/portal-compatibility.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/ipc/register-handlers.ts`
  - `shared/ipc.ts`
  - `electron/preload.ts`
  - `electron/main.ts`
  - New: `tests/unit/portal-compatibility.test.ts`
  - New: `tests/integration/background-sync-compatibility.test.ts`
  - Editado: `tests/integration/clear-all-data.test.ts`

Título original: "Add compatibility degradation and kill-switch behavior".
Reescrito em 2026-09-12 depois de dois attempts do loop pararem na mesma
pergunta: AC3 e AC5 precisavam de `register-handlers.ts` e `shared/ipc.ts`,
fora dos Primary files. Resposta: entram. E o ticket foi fatiado: este é o
lado main (estado, gate, IPC); `PORTAL-006` é o renderer (aviso e restauração
visível). `src/pages/dashboard.ts` e `src/pages/sync-selection.ts` saem daqui.

## Releitura (2026-09-12)

1. `BackgroundSyncService.syncNow()` (`background-sync.service.ts:57-69`) só é
   gateado por `settings.runInBackground`; `runSync` (`:71-320`) trata falha de
   `getCourses` e de `getCourseFiles` só com `log.error`/`log.warn`, não
   persiste nem avisa nada. O push `background-sync-update` (`:264-277`) só sai
   quando houve disciplina com dado novo; em falha, nunca sai.
2. Falha estrutural já tem código: `SELECTOR_DRIFT` (`shared/errors.ts`), vindo
   dos validadores do `portal-adapter.ts` (`PORTAL-001`) e do
   `http-scraper.service.ts`. `PORTAL_UNAVAILABLE` e `SESSION_EXPIRED` são
   `RETRYABLE` e **não** são estruturais.
3. Sync manual hoje é o renderer chamando `getCourses()` e depois
   `getCourseFiles()` por disciplina (`sync-selection.ts:155`); não existe canal
   `sync-now`. Handlers em `register-handlers.ts` passam por `handle()` com
   `parse`/`onInvalid` (`:85-107`); `IpcDeps` em `:35-68`.
4. `persistence.service.ts` tem allowlist de chave (`VALIDATORS`) e o handler
   `update-app-setting` deixa o renderer gravar qualquer chave válida. Estado de
   compatibilidade não pode ser gravável pelo renderer, então não vai para
   `settings.json`.

## Decisões

1. **Limiar: 3 ciclos consecutivos com falha estrutural.** Um ciclo do
   `runSync` conta como falha estrutural quando `getCourses` falha com
   `SELECTOR_DRIFT`, ou quando pelo menos uma disciplina foi tentada e **todas**
   as `getCourseFiles` do ciclo falharam com `SELECTOR_DRIFT`. Ciclo que
   completou (sucesso, ou drift em só parte das disciplinas) zera o contador.
   Ciclo que não chegou ao portal (`PORTAL_UNAVAILABLE`, `SESSION_EXPIRED` sem
   relogin) não conta nem zera: outage não ensina nada sobre estrutura.
2. **Estado próprio, em `userData/compatibility.json`**, dono
   `PortalCompatibilityService`. Não em `settings.json` (releitura, item 4).
   Arquivo ausente ou corrompido lê como `ok`; falha de escrita é logada e o
   estado fica em memória (decisão, não engolimento: o próximo flip tenta de
   novo). Sobrevive a restart: é isso que impede login repetido depois de
   reabrir o app (AC4).
3. **Gate no `syncNow()`, não no `start()`.** `incompatible` faz `syncNow`
   retornar antes de `operations.run`: sem login, sem download. O timer
   continua; quando o estado voltar a `ok`, o próximo tick roda sem restart.
4. **Restaura um `getCourseFiles` manual bem-sucedido**, no handler
   `get-course-files`. Não `get-courses`: se o drift está na página da
   disciplina, `getCourses` passa e o estado ficaria oscilando. O fluxo manual
   do `sync-selection.ts` chama os dois, então o caminho do usuário cobre.
   "Canário" sai do AC5: o `PORTAL-004` virou check manual local e não fala com
   o app.
5. **Um ponto de notificação.** O serviço recebe `onChange` no construtor;
   `main.ts` passa `s => getWindow()?.webContents.send('compatibility-changed', s)`.
   Flip por sync em background e restauração manual passam pelo mesmo lugar.
   O renderer lê o estado no mount por `get-compatibility-status` e assina
   `compatibility-changed` para o resto; sem polling. `onChange` só dispara em
   mudança de `state`: falha 1 e 2 não notificam.
6. **Clear-all zera o estado.** `clear-all-data` chama
   `deps.compatibility.clear()`; deixar "incompatível" depois de "limpar tudo"
   seria surpresa.
7. **Dado em cache continua visível (AC2) sem código novo:** o renderer lê
   `localStorage`; o gate só impede sync. `PORTAL-006` confirma na UI.

#### Acceptance criteria

- Falhas estruturais repetidas desligam sync em background e auto-download
  (decisões 1 e 3).
- Dado em cache da conta continua visível (decisão 7).
- O app não repete login que possa bloquear a conta: o gate fica antes de
  `operations.run` e o estado sobrevive a restart (decisões 2 e 3).
- Um `getCourseFiles` manual bem-sucedido restaura o estado (decisão 4).
- O renderer consegue ler o estado e ser avisado da mudança (decisão 5); o que
  ele mostra é `PORTAL-006`.

## Contrato

```ts
// shared/ipc.ts
export type CompatibilityStatus =
  | { state: 'ok' }
  | { state: 'incompatible'; since: number; failures: number; lastCode: 'SELECTOR_DRIFT' }
// RendererApi (acréscimos)
getCompatibilityStatus: () => Promise<CompatibilityStatus>
onCompatibilityChanged: (callback: (s: CompatibilityStatus) => void) => () => void

// electron/services/portal-compatibility.service.ts
export const STRUCTURAL_FAILURE_THRESHOLD = 3;
export class PortalCompatibilityService {
  constructor(filePath: string, onChange: (s: CompatibilityStatus) => void);
  /** Lê o arquivo uma vez, preguiçoso; ausente ou inválido é `ok`. */
  status(): CompatibilityStatus;
  /** Conta um ciclo com falha estrutural; no 3º consecutivo vira `incompatible` e chama `onChange`. Nunca lança. */
  recordStructuralFailure(code: 'SELECTOR_DRIFT'): void;
  /** Zera o contador; se estava `incompatible`, volta a `ok` e chama `onChange`. Nunca lança. */
  recordSuccess(): void;
  /** Volta a `ok` e apaga o arquivo. Rejeita com o erro da exclusão. */
  clear(): Promise<void>;
}

// electron/services/background-sync.service.ts
constructor(sigaaService, getWindow?, compatibility?: Pick<PortalCompatibilityService, 'status' | 'recordStructuralFailure' | 'recordSuccess'>)

// electron/ipc/register-handlers.ts — IpcDeps (acréscimo)
compatibility: Pick<PortalCompatibilityService, 'status' | 'recordSuccess' | 'clear'>;
// 'get-compatibility-status': sem payload, devolve status().
// 'get-course-files': em result.success, recordSuccess() antes de devolver.
// 'clear-all-data': compatibility.clear() entra na agregação de STORAGE.
```

## Critérios de aceite (detalhados)

1. **Limiar.** Serviço em pasta temporária: 2 `recordStructuralFailure` deixam
   `ok` e não chamam `onChange`; o 3º vira `incompatible` com `failures: 3` e
   chama `onChange` uma vez. `recordSuccess` depois de 2 falhas zera: mais 2
   falhas continuam `ok`.
2. **Persistência.** Depois do flip, uma segunda instância sobre o mesmo
   arquivo lê `incompatible`. Arquivo com JSON inválido lê `ok`. `writeFile`
   rejeitando `EPERM`: `status()` devolve `incompatible` mesmo assim e o
   logger recebe uma linha.
3. **Gate.** `BackgroundSyncService` com `compatibility.status()` devolvendo
   `incompatible`: `syncNow()` resolve sem chamar `sigaaService.getCourses`,
   `login` nem `downloadAllFiles`. Com `ok`, chama como hoje
   (`background-sync.test.ts` segue verde).
4. ❌ **Contagem no ciclo.** Três ciclos com `getCourses` em
   `fail('SELECTOR_DRIFT', …)` chamam `recordStructuralFailure` três vezes.
   Ciclo com `PORTAL_UNAVAILABLE` não chama nem `recordStructuralFailure` nem
   `recordSuccess`. Ciclo com `getCourses` ok e 2 de 2 `getCourseFiles` em
   `SELECTOR_DRIFT` conta; com 1 de 2, chama `recordSuccess`.
   **Falta o caminho de re-login:** ciclo em que o primeiro `getCourses` falha
   com `SESSION_EXPIRED`, o `login` passa e o `getCourses` de retry falha com
   `SELECTOR_DRIFT` também conta como falha estrutural.
5. **Restauração.** `get-course-files` com `sigaaService.getCourseFiles` ok
   chama `deps.compatibility.recordSuccess()`; com falha, não chama.
   `get-compatibility-status` devolve o que `status()` devolve.
6. **Clear-all.** `clear-all-data.test.ts`: `deps.compatibility.clear()` é
   chamado; rejeitando, a falha aparece agregada em `STORAGE` como as outras.
7. **Preload.** `getCompatibilityStatus` e `onCompatibilityChanged` existem em
   `RendererApi` e no preload, com o `off` no retorno, mesmo padrão de
   `onBackgroundSyncUpdate` (`preload.ts:57-61`). `npm run typecheck` pega o
   método faltando de um lado ou do outro.

#### Verification

```text
npx vitest run tests/unit/portal-compatibility.test.ts tests/integration/background-sync-compatibility.test.ts tests/integration/clear-all-data.test.ts
npm run quality
```

## Testes que a etapa 2 escreve

- `tests/unit/portal-compatibility.test.ts` — critérios 1 e 2, `fs` real em
  pasta temporária, `onChange` como `vi.fn()`.
- `tests/integration/background-sync-compatibility.test.ts` — critérios 3 e 4,
  copiando o harness de `background-sync.test.ts` (`sigaaService` com
  `vi.fn()`, `persistenceService`/`cacheService`/`logger` mockados) e passando
  um `compatibility` duplo no construtor.
- `tests/integration/clear-all-data.test.ts` — critérios 5 e 6 (já monta
  `IpcDeps` completo e chama `registerIpcHandlers`).

## Para o revisor

- Nenhum `as any` no preload nem no handler (regras 2 e 4). O canal novo é
  nomeado, sem payload, e devolve só `CompatibilityStatus`.
- `recordStructuralFailure` e `recordSuccess` nunca lançam; `clear()` rejeita
  (padrão do `logger.clear()` e do `diagnostics.clear()` do `OBS-003`).
- `runSync` não ganhou parâmetro novo; a contagem lê `error.code` dos
  `AppResult` que já existem.

#### Implementation notes

- Commits: `bd3cdc7` (`PortalCompatibilityService`), `1f9e65e` (gate +
  contagem em `BackgroundSyncService`), `c696d1b` (handlers IPC), `502966e`
  (preload + main); testes em `d5d0878`/`ce91b88`, sentinela de canal IPC em
  `930ccc8`.
- Trigger threshold: 3 ciclos consecutivos (decisão 1)
- `npm run quality`: typecheck limpo, lint sem erro novo (só os warnings
  `no-explicit-any` já existentes fora do escopo desta issue), 683 testes
  verdes (60 arquivos).
- `tests/unit/ipc-validation.test.ts` (fora dos Primary files) precisou de
  ajuste mecânico: o novo canal `get-compatibility-status` mudou a contagem
  que o teste fixa por nome — o próprio teste se chama "novo canal aparece
  aqui". Nenhuma asserção de comportamento mudou, só o roster.

#### Review (2026-09-12) — reaberto

Gate verde na branch (`683 passed | 4 skipped`, 60 arquivos, lint 0 erros).
Separação de commits correta: testes em `d5d0878`/`ce91b88`/`930ccc8`, código em
`bd3cdc7`/`1f9e65e`/`c696d1b`/`502966e`, nenhum commit de código toca teste.
Critérios 1, 2, 3, 5, 6 e 7 conferidos contra o código e contra os testes, que
chamam código de produção e falhariam sem a mudança. Contrato, `IpcDeps`,
preload e `shared/ipc.ts` batem com o bloco `## Contrato` — sem creep.

O que falta (**bloqueante, é por isso que volta para a etapa 2**):

1. **Critério 4 / decisão 1 — o retry pós-re-login não conta drift.**
   `background-sync.service.ts:110-114` devolve em qualquer código de erro:

   ```ts
   const retryCourses = await this.sigaaService.getCourses();
   if (!retryCourses.success) {
       log.error('Retry after re-login failed.', { error: retryCourses.error.message });
       return;
   }
   ```

   O ramo de cima (`:120-127`) chama `recordStructuralFailure` em
   `SELECTOR_DRIFT`; este não. Sessão expirada é rotina no SIGAA, então este é
   um caminho quente, e é **o único ramo do ciclo que faz login de verdade** —
   exatamente o que o AC3 ("não repete login que possa bloquear a conta") existe
   para cortar. Hoje, um portal que derivou e devolve `SESSION_EXPIRED` na
   primeira sondagem faz login a cada ciclo, para sempre, sem nunca armar o
   kill-switch. Fica dentro dos Primary files, mas precisa de teste novo — por
   isso reabre em vez de virar correção da etapa 3.

2. **Menor, decisão 5 — `onChange` pode repetir com o `state` igual.**
   `portal-compatibility.service.ts:47-60` só guarda
   `consecutiveFailures < STRUCTURAL_FAILURE_THRESHOLD`. Já `incompatible`, uma
   4ª chamada persiste de novo e chama `onChange` outra vez, contra "só dispara
   em mudança de `state`". Hoje é inalcançável (o gate do `syncNow` corta o
   ciclo antes), então é dívida de contrato, não bug — mas o item 1 já abre o
   arquivo ao lado; feche junto, com a asserção no teste de unidade.

3. **Menor, robustez — `onChange` que lança quebra o "nunca lança".**
   `main.ts:93` usa `win?.webContents.send(...)`; o `?.` cobre `null`, não
   janela destruída, e `background-sync.service.ts:295` já usa o guarda certo
   (`window && !window.isDestroyed()`). Como `recordStructuralFailure`/
   `recordSuccess` chamam `onChange` fora de `try`, um throw sobe. Em
   `background-sync.service.ts:284-288` isso cairia **antes** do push,
   das notificações, do `lastBackgroundSync` e do `pendingCommits` — invertendo
   a ordem que o DATA-003 fixa no comentário de `:329-331`. Alcançável só na
   janela do quit (com `runInBackground` a janela é escondida, não destruída),
   então é estreito. `isDestroyed()` no `main.ts` resolve.

Fora de escopo, avaliado e **aceito**: o `catch`/`log` do `persist()`
(`:94-103`) e o `catch` mudo do `readFromDisk()` (`:84-92`) chegam perto da
regra 3, mas os dois são decisão documentada e exigida pelo critério 2 — o
alternativo (propagar) quebraria o "nunca lança". O `onInvalid` que lança em
`get-compatibility-status` segue o precedente do `get-app-settings`
(`register-handlers.ts:252-258`). O ajuste em `ipc-validation.test.ts` é
mecânico, declarado e ficou em commit de teste próprio.

## Comments

- 2026-09-12 Attempts 1 e 2 do loop pararam na mesma pergunta (seam fora dos
  Primary files). Respondido acima: arquivos entram, ticket fatiado em
  `PORTAL-005` (main) e `PORTAL-006` (renderer); contador de attempts zerado
  com a reescrita.
