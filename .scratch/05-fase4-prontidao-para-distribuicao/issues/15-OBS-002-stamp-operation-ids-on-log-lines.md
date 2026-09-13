# OBS-002 — Stamp operation IDs on log lines
Status: resolved
Stage: done
Priority: P3
Blocked by: OBS-004

- Owner: —
- Dependencies: `OBS-001`, `OBS-004` (o `BackgroundSync` precisa já escrever
  no logger para o teste do ciclo fazer sentido)
- Primary files:
  - `electron/services/session-operation-coordinator.service.ts`
  - `electron/services/background-sync.service.ts`
  - `electron/services/logger.service.ts` (lê `currentOperationId()`)
  - New: `tests/unit/operation-id.test.ts`
  - Editado: `tests/integration/logging-boundary.test.ts` (asserção de op id
    nos dois ciclos de `syncNow`)

Fatiado de `OBS-001` em 2026-09-08. Seam: correlacionar as linhas de uma
operação sem passar id por parâmetro. Ninguém lê o log de produção ainda; o
consumidor é o desenvolvedor. Se a prioridade cair, este ticket pode ser
cortado sem afetar `OBS-001` nem `OBS-003`.

#### What to build

- `session-operation-coordinator.service.ts` exporta
  `runOperation(name, fn)` e `currentOperationId()` sobre um
  `AsyncLocalStorage` de módulo.
- `SessionOperationCoordinator.start()` envolve `fn` em `runOperation`.
- `BackgroundSyncService.syncNow()` envolve o **ciclo inteiro**, inclusive a
  linha de abertura anterior a `operations.run` (`background-sync.service.ts:64`).
- O logger lê `currentOperationId()` e carimba `[op:<id>]` depois de
  `[<scope>]`. O coordenador não importa o logger (sem ciclo de import).

#### Acceptance criteria

- Toda linha dentro de uma `runOperation` carrega o mesmo `op:<id>`; fora,
  nenhuma carrega.
- Operações concorrentes têm ids distintos; chamada aninhada mantém o id de
  fora.
- Um ciclo de `syncNow` tem um id só e **toda** linha `[BackgroundSync]` do
  ciclo o carrega. O teste falha nomeando a primeira linha sem id antes de
  conferir igualdade (auditoria cega de 2026-09-07, achado 6: `filter(Boolean)`
  aceitava linha sem id).
- ~~`name` aparece em `meta` só na primeira linha~~ — cortado em 2026-09-12,
  ver "Decisão do humano" nos Comments.

#### Verification

```text
npx vitest run tests/unit/operation-id.test.ts tests/integration/logging-boundary.test.ts
npm run quality
```

## Contrato

```ts
// electron/services/session-operation-coordinator.service.ts (acréscimo)
export function runOperation<T>(name: string, fn: () => Promise<T>): Promise<T>;
export function currentOperationId(): string | undefined;
```

Formato da linha com o campo preenchido:

```text
<ISO-8601> <LEVEL> [<scope>] [op:<id>] <message> <meta em JSON, se houver>
```

`id` é curto e opaco (8 hex de um `randomUUID()` bastam). `name` não aparece
no log: a linha de abertura que `syncNow` e `start()` já emitem diz qual é a
operação (cortado em 2026-09-12; a assinatura de `runOperation` mantém o
parâmetro para documentar o call site).

## Para o revisor

- `AsyncLocalStorage` atravessa `await`, `setTimeout` e promessas; **não**
  atravessa callbacks de eventos registrados fora da operação (`page.on`,
  `ipcMain.handle`). Linha emitida de um desses callbacks sai sem id, e isso é
  aceito; o teste não deve exigir id ali.
- Nenhum parâmetro `operationId` novo em assinatura de método: se apareceu, o
  `AsyncLocalStorage` não está sendo usado.

## Revisão da etapa 3 (Opus, 2026-09-12) — segunda passada, fechada

Base `master` (`35248ae`), HEAD revisado `5ce5c50` mais o commit desta revisão.
Escopo: o diff inteiro (`git diff master...obs-002`), porque a primeira passada
caiu sobre o requisito que o humano cortou, não sobre o resto do código.

#### Resolution (2026-09-12)

Aprovada. Um achado de Standards corrigido nesta revisão — cabe nos Primary
files e não pede teste novo, então é fix pequeno pela régua do loop.

- ✅ **Critério 1, id dentro e só dentro da operação.**
  `tests/unit/operation-id.test.ts:23-32` prova os dois lados: `seenInside`
  definido, `currentOperationId()` de volta a `undefined` depois do resolve.
  O store é um `AsyncLocalStorage` de módulo
  (`session-operation-coordinator.service.ts:14`), separado do `this.context`
  da fila, e o logger o lê por import de função
  (`logger.service.ts:4,218-219`). A direção do import é a certa: o logger
  importa o coordenador, o coordenador não importa o logger — sem ciclo.
- ✅ **Critério 2, concorrência e aninhamento.**
  `operation-id.test.ts:41-65` roda duas operações intercaladas por
  `setTimeout(0)` e exige id estável em cada uma e diferente entre elas;
  `:83-94` cobre o reentrante do `CONC-001`. O aninhado herda porque
  `run()` devolve `fn(outer.controller.signal)` inline quando já há operação
  viva (`session-operation-coordinator.service.ts:66-70`) — nunca chega em
  `start()`, logo não cunha id novo.
- ✅ **Critério 3, um ciclo de `syncNow` com um id só.**
  `logging-boundary.test.ts:120-126` é o ponto que a auditoria de 2026-09-07
  pediu: `backgroundSyncOpIds` faz `expect(match).not.toBeNull()` com a linha
  na mensagem, em vez de `filter(Boolean)`. Re-rodado aqui contra o `master`
  sem o patch, e ele falha nomeando exatamente a linha que era o risco:
  `linha [BackgroundSync] sem op id: ... INFO [BackgroundSync] Triggering
  background sync.`. O segundo ciclo prova id distinto.
- ✅ **Contrato.** Assinaturas iguais às declaradas; formato
  `[<scope>] [op:<id>] <message>` em `logger.service.ts:223`, com `opTag`
  vazio fora de operação — por isso as linhas antigas não mudaram e as 56
  suítes seguem verdes. `id` são 8 hex de `randomUUID()`.
- ✅ **Nenhum `operationId` em assinatura.** `grep` no diff: nenhum parâmetro
  novo. `background-sync.service.ts` não ganhou argumento — a linha de abertura
  foi **movida** para dentro de `runSync`, que já roda dentro do
  `operations.run`. O coordenador chama `fn` sempre, mesmo com o signal
  abortado, então a linha não deixa de sair; ela só passa a sair depois da
  fila admitir a operação.
- ✅ **Achado de Standards corrigido.** `OperationIdContext.name` era escrito e
  nunca lido. Com o requisito "name em meta" cortado, o campo é Speculative
  Generality — removido neste commit. A assinatura `runOperation(name, fn)`
  fica, como o humano decidiu, e o parâmetro é consumido por um `void name`
  para não bater no `noUnusedParameters` do `tsconfig`.

Os dois `AsyncLocalStorage.run` aninhados em `start()` ficam: são stores
diferentes (`RunningOperation` para a reentrância do `CONC-001`, id de operação
para o log) e juntá-los obrigaria o logger a importar a fila do coordenador.
Não é duplicação acidental.

Red-green re-executado nesta revisão, não herdado do relatório da etapa 2:
com `electron/services/` de volta ao `master` e os testes da branch,
`8 failed | 6 passed (14)`; com o patch, `npm run quality` verde —
0 erros de ESLint (57 warnings herdados de `no-explicit-any`),
`56 passed (56)` arquivos, `653 passed | 4 skipped (657)`.

Fora do escopo, encaminhado: a nota do `OBS-005` sobre ~12 chamadas de
`playwright-login.service.ts` que interpolam valor na mensagem foi copiada para
os `## Comments` do `OBS-003`, que tem esse arquivo nos Primary files. Este
ticket não tocou nenhuma daquelas linhas.

## Comments

**Decisão do humano (2026-09-12): corta o requisito, volta a `to-review`.**
O consumidor do log é o desenvolvedor, e a linha de abertura da operação já
nomeia o que está rodando; um mecanismo de "primeira linha" no
`AsyncLocalStorage` seria código para um dado que ninguém lê. Contrato e
critério ajustados acima. A branch já cumpre o resto do ticket, então não há
rodada de etapa 2: a etapa 3 revisa de novo e, como fix pequeno dentro dos
Primary files e sem teste novo, **remove o campo `name` do
`OperationIdContext`** (o achado de Standards), mantendo a assinatura
`runOperation(name, fn)` para os testes ficarem intocados.

**Revisão do OBS-002 (2026-09-12), reabre.** Standards + Spec, ambos em paralelo,
`git diff master...HEAD` do branch `obs-002` (3 commits: teste vermelho, `feat`,
bump de estágio).

Standards: nenhuma violação de regra documentada (nada de `console.*` fora do
logger, nada de `as any`, nenhum `try/catch` engolindo erro, nenhum
`operationId` novo em assinatura). Dois achados de julgamento, não bloqueantes
por si: `OperationIdContext.name` é capturado e nunca lido em lugar nenhum
(possível Speculative Generality), e `start()` agora abre dois
`AsyncLocalStorage.run` aninhados para a mesma operação — decisão arquitetural
deliberada e comentada (logger não pode importar a fila do coordenador), não
duplicação acidental.

Spec: contrato e todas as três acceptance criteria batem — assinaturas exatas de
`runOperation`/`currentOperationId`, `start()` envolvendo `fn`, a linha de
abertura do `syncNow` movida para dentro do ciclo, aninhamento herdando o id de
fora, formato `[<scope>] [op:<id>] <message>`. Um requisito do Contrato ficou de
fora: *"`name` vai só na primeira linha da operação, como `meta`"* — nada grava
`name` em lugar nenhum; é exatamente o mesmo dado que a revisão de Standards
achou morto. As duas revisões, independentes, apontam para o mesmo buraco.

Por que reabre em vez de fix pequeno: implementar isso precisa de um mecanismo
novo (saber que uma linha é a primeira da operação — estado mutável no
contexto do `AsyncLocalStorage`, lido pelo logger) e de teste novo que hoje não
existe (nenhum teste afirma `name` em `meta` na primeira linha, nem a ausência
dele nas seguintes). Foge da régua de "fix pequeno" do loop
(`docs/agents/ticket-flow` — cabe nos Primary files *e* não precisa de teste
novo); volta para o stage 2.

**Da revisão do `OBS-005` (2026-09-09).** Depois da migração,
`playwright-login.service.ts` ainda tem ~12 chamadas que interpolam valor no
texto da mensagem em vez de passar em `meta`: `currentUrl`, `page.url()`,
`newsId`, `courses.length`. Nenhum é dos cinco valores não confiáveis que o
`OBS-005` nomeia, e todos passam o grep do critério 3 daquele ticket, então
ficaram. Se este ticket for mexer nessas linhas para pendurar `[op:<id>]`, é a
hora barata de mover o valor para `meta` junto — `url` já está em
`CONTENT_KEYS`, `newsId` não precisa estar.
