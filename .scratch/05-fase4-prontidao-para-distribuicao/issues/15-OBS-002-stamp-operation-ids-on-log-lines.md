# OBS-002 — Stamp operation IDs on log lines
Status: open
Stage: to-implement
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
- ❌ `name` aparece em `meta` só na primeira linha logada dentro da
  `runOperation`; nenhuma linha seguinte da mesma operação o repete.

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

`id` é curto e opaco (8 hex de um `randomUUID()` bastam); `name` vai só na
primeira linha da operação, como `meta`.

## Para o revisor

- `AsyncLocalStorage` atravessa `await`, `setTimeout` e promessas; **não**
  atravessa callbacks de eventos registrados fora da operação (`page.on`,
  `ipcMain.handle`). Linha emitida de um desses callbacks sai sem id, e isso é
  aceito; o teste não deve exigir id ali.
- Nenhum parâmetro `operationId` novo em assinatura de método: se apareceu, o
  `AsyncLocalStorage` não está sendo usado.

## Comments

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
