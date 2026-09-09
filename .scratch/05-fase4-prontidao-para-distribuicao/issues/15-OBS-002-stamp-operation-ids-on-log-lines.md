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
