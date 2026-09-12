import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * `interactive`/`auth` abortam `background`; `shutdown` aborta tudo;
 * `background` não aborta ninguém (CONC-001, contrato na issue).
 */
export type OperationKind = 'interactive' | 'background' | 'auth' | 'shutdown';

interface OperationIdContext {
    id: string;
    name: string;
}

const operationIdContext = new AsyncLocalStorage<OperationIdContext>();

/**
 * Correlaciona as linhas de log de uma operação sem passar id por parâmetro
 * (OBS-002). `AsyncLocalStorage` de módulo, separado da fila do coordenador:
 * o logger lê `currentOperationId()` e o coordenador nunca importa o logger.
 */
export function runOperation<T>(name: string, fn: () => Promise<T>): Promise<T> {
    return operationIdContext.run({ id: randomUUID().slice(0, 8), name }, fn);
}

export function currentOperationId(): string | undefined {
    return operationIdContext.getStore()?.id;
}

interface QueueEntry {
    kind: OperationKind;
    controller: AbortController;
    start: () => void;
}

interface RunningOperation {
    kind: OperationKind;
    controller: AbortController;
    finished: boolean;
    done: Promise<void>;
}

const KINDS_ABORTED_BY: Record<OperationKind, OperationKind[]> = {
    interactive: ['background'],
    auth: ['background'],
    background: [],
    shutdown: ['interactive', 'background', 'auth', 'shutdown'],
};

/**
 * Único dono da sessão Playwright por vez. Fila FIFO de um slot só, com um
 * `AbortController` por operação. Nunca fabrica resultado: `fn` é sempre
 * chamada, mesmo com o signal já abortado — cabe a `fn` checar o signal e
 * devolver `CANCELLED`.
 */
export class SessionOperationCoordinator {
    private queue: QueueEntry[] = [];
    private running: RunningOperation | null = null;
    private readonly context = new AsyncLocalStorage<RunningOperation>();

    run<T>(kind: OperationKind, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
        const outer = this.context.getStore();
        if (outer && !outer.finished) {
            // Chamada aninhada: roda inline com o signal de fora, sem travar
            // esperando o próprio chamador terminar (decisão 8 / 1 do CONC-001).
            return fn(outer.controller.signal);
        }

        const controller = new AbortController();
        this.abortKinds(KINDS_ABORTED_BY[kind]);

        return new Promise<T>((resolve, reject) => {
            this.queue.push({
                kind,
                controller,
                start: () => this.start(kind, controller, fn, resolve, reject),
            });
            this.advance();
        });
    }

    async cancel(kind: OperationKind): Promise<void> {
        const runningOfKind = this.running?.kind === kind ? this.running : null;
        this.abortKinds([kind]);
        if (runningOfKind) await runningOfKind.done;
    }

    private start<T>(
        kind: OperationKind,
        controller: AbortController,
        fn: (signal: AbortSignal) => Promise<T>,
        resolve: (value: T) => void,
        reject: (reason: unknown) => void,
    ): void {
        let markDone!: () => void;
        const done = new Promise<void>(res => { markDone = res; });
        const operation: RunningOperation = { kind, controller, finished: false, done };
        this.running = operation;

        this.context.run(operation, () => {
            runOperation(kind, () => fn(controller.signal)).then(resolve, reject).finally(() => {
                operation.finished = true;
                this.running = null;
                markDone();
                this.advance();
            });
        });
    }

    private advance(): void {
        if (this.running) return;
        const next = this.queue.shift();
        next?.start();
    }

    private abortKinds(kinds: OperationKind[]): void {
        if (kinds.length === 0) return;
        if (this.running && kinds.includes(this.running.kind)) this.running.controller.abort();
        for (const entry of this.queue) {
            if (kinds.includes(entry.kind)) entry.controller.abort();
        }
    }
}
