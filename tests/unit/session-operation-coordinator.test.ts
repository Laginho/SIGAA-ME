/**
 * CONC-001 — `SessionOperationCoordinator`: um dono da sessão Playwright por vez.
 *
 * O `busyCount` do `SigaaService` só contava; nada impedia o sync em background
 * e um clique do usuário de navegar a mesma página ao mesmo tempo. O
 * coordenador é uma fila com um único slot e um `AbortSignal` por operação:
 *
 * - `run(kind, fn)` espera a vez, chama `fn(signal)` e devolve o que `fn`
 *   devolver. Nunca fabrica resultado: uma operação cancelada antes de começar
 *   ainda roda, mas com o signal já abortado — é `fn` quem decide devolver
 *   `CANCELLED` sem tocar em nada.
 * - `interactive` e `auth` abortam toda operação `background` (em voo ou na
 *   fila) e só começam quando a que estava em voo parar.
 * - `shutdown` aborta tudo (qualquer tipo) e espera a que estava em voo parar.
 * - `background` não aborta ninguém.
 * - `cancel(kind)` aborta todas as operações daquele tipo e resolve quando a
 *   que estava em voo (se era desse tipo) parar. É o que
 *   `BackgroundSyncService.cancel()` passa a chamar.
 * - Chamada aninhada (um `run` de dentro de outro) roda inline com o mesmo
 *   signal — é assim que o sync chama `sigaaService.getCourseFiles`, que por
 *   sua vez chama `run`, sem travar esperando por si mesmo.
 *
 * Só timers reais e curtos; nada de Playwright. Vermelho hoje pelo motivo
 * certo: o módulo não existe.
 */
import { describe, expect, it } from 'vitest';
import { SessionOperationCoordinator } from '../../electron/services/session-operation-coordinator.service';

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
/** Para afirmar que algo NÃO aconteceu sem esperar o timeout de 30s do vitest. */
const timeout = (ms: number) => new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms));

/** Operação que registra início/fim (com `:aborted` quando o signal já estava abortado) e fica em voo até `release()`. */
function makeOp(log: string[], name: string) {
    const gate = deferred();
    const captured: { signal: AbortSignal | null } = { signal: null };
    const fn = async (signal: AbortSignal): Promise<string> => {
        captured.signal = signal;
        log.push(`${name}:start${signal.aborted ? ':aborted' : ''}`);
        await gate.promise;
        log.push(`${name}:end${signal.aborted ? ':aborted' : ''}`);
        return name;
    };
    return { fn, release: gate.resolve, get signal() { return captured.signal; } };
}

describe('SessionOperationCoordinator (CONC-001)', () => {
    describe('one operation at a time', () => {
        it('runs operations one at a time, in arrival order, and returns what each fn returned', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const a = makeOp(log, 'a');
            const b = makeOp(log, 'b');

            const pa = coordinator.run('interactive', a.fn);
            const pb = coordinator.run('interactive', b.fn);
            await tick();
            expect(log).toEqual(['a:start']);

            a.release();
            await tick();
            expect(log).toEqual(['a:start', 'a:end', 'b:start']);

            b.release();
            expect(await pa).toBe('a');
            expect(await pb).toBe('b');
            expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
        });

        it('hands each operation a live AbortSignal that is not aborted by default', async () => {
            const coordinator = new SessionOperationCoordinator();

            const signal = await coordinator.run('background', async (s) => s);

            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
        });

        it('a throwing operation rejects its caller and releases the slot for the next one', async () => {
            const coordinator = new SessionOperationCoordinator();

            await expect(coordinator.run('interactive', async () => { throw new Error('boom'); })).rejects.toThrow('boom');

            const next = coordinator.run('interactive', async () => 'next');
            expect(await Promise.race([next, timeout(300)])).toBe('next');
        });
    });

    describe('priority between kinds', () => {
        it('an interactive request aborts the running background operation and starts only after it has stopped', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const bg = makeOp(log, 'bg');
            const int = makeOp(log, 'int');

            const pbg = coordinator.run('background', bg.fn);
            await tick();
            const pint = coordinator.run('interactive', int.fn);
            await tick();

            expect(bg.signal?.aborted).toBe(true);
            expect(log).toEqual(['bg:start']);

            bg.release();
            await tick();
            expect(log).toEqual(['bg:start', 'bg:end:aborted', 'int:start']);
            expect(int.signal?.aborted).toBe(false);

            int.release();
            await Promise.all([pbg, pint]);
        });

        it('an interactive request aborts a background operation still waiting in the queue', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const int1 = makeOp(log, 'int1');
            const bg = makeOp(log, 'bg');
            const int2 = makeOp(log, 'int2');

            const p1 = coordinator.run('interactive', int1.fn);
            const pbg = coordinator.run('background', bg.fn);
            const p2 = coordinator.run('interactive', int2.fn);
            await tick();
            expect(log).toEqual(['int1:start']);

            int1.release();
            await tick();
            bg.release();
            await tick();
            int2.release();
            await Promise.all([p1, pbg, p2]);

            // A ordem entre uma operação já abortada e a interativa é livre;
            // o que importa é que o background nunca rodou com signal vivo.
            expect(log).toContain('bg:start:aborted');
            expect(log).toContain('int2:start');
            expect(int2.signal?.aborted).toBe(false);
        });

        it('a background request aborts nothing and waits its turn behind an interactive operation', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const int = makeOp(log, 'int');
            const bg = makeOp(log, 'bg');

            const pint = coordinator.run('interactive', int.fn);
            await tick();
            const pbg = coordinator.run('background', bg.fn);
            await tick();

            expect(int.signal?.aborted).toBe(false);
            expect(log).toEqual(['int:start']);

            int.release();
            await tick();
            expect(log).toEqual(['int:start', 'int:end', 'bg:start']);
            expect(bg.signal?.aborted).toBe(false);

            bg.release();
            await Promise.all([pint, pbg]);
        });

        it('`auth` supersedes background exactly like interactive does', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const bg = makeOp(log, 'bg');
            const auth = makeOp(log, 'auth');

            const pbg = coordinator.run('background', bg.fn);
            await tick();
            const pauth = coordinator.run('auth', auth.fn);
            await tick();

            expect(bg.signal?.aborted).toBe(true);
            expect(log).toEqual(['bg:start']);

            bg.release();
            await tick();
            expect(log).toEqual(['bg:start', 'bg:end:aborted', 'auth:start']);

            auth.release();
            await Promise.all([pbg, pauth]);
        });

        it('shutdown aborts everything in flight and queued, and runs only after the running operation has stopped', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const int = makeOp(log, 'int');
            const bg = makeOp(log, 'bg');
            const down = makeOp(log, 'down');

            const pint = coordinator.run('interactive', int.fn);
            await tick();
            const pbg = coordinator.run('background', bg.fn);
            const pdown = coordinator.run('shutdown', down.fn);
            await tick();

            // Logout não fecha o navegador por baixo de uma operação em voo.
            expect(int.signal?.aborted).toBe(true);
            expect(log).toEqual(['int:start']);

            int.release();
            await tick();
            bg.release();
            await tick();
            down.release();
            await Promise.all([pint, pbg, pdown]);

            expect(log.indexOf('int:end:aborted')).toBeGreaterThanOrEqual(0);
            expect(log.indexOf('down:start')).toBeGreaterThan(log.indexOf('int:end:aborted'));
            expect(log).toContain('bg:start:aborted');
            expect(down.signal?.aborted).toBe(false);
        });

        it('after a shutdown finished, new operations run normally', async () => {
            const coordinator = new SessionOperationCoordinator();

            await coordinator.run('shutdown', async () => undefined);
            const next = coordinator.run('interactive', async (s) => (s.aborted ? 'aborted' : 'ok'));

            expect(await Promise.race([next, timeout(300)])).toBe('ok');
        });
    });

    describe('cancel(kind)', () => {
        it('aborts the running operation of that kind and resolves only after it has stopped', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const bg = makeOp(log, 'bg');

            const pbg = coordinator.run('background', bg.fn);
            await tick();
            let settled = false;
            const cancelled = coordinator.cancel('background').then(() => { settled = true; });
            await tick();

            expect(bg.signal?.aborted).toBe(true);
            expect(settled).toBe(false);

            bg.release();
            await Promise.all([pbg, cancelled]);
            expect(settled).toBe(true);
            expect(log).toEqual(['bg:start', 'bg:end:aborted']);
        });

        it('resolves at once when nothing of that kind is running, and leaves other kinds alone', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const int = makeOp(log, 'int');

            const pint = coordinator.run('interactive', int.fn);
            await tick();

            const outcome = await Promise.race([coordinator.cancel('background').then(() => 'resolved'), timeout(300)]);
            expect(outcome).toBe('resolved');
            expect(int.signal?.aborted).toBe(false);

            int.release();
            await pint;
        });

        it('also aborts queued operations of that kind, which then run with an aborted signal', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            const int = makeOp(log, 'int');
            const bg = makeOp(log, 'bg');

            const pint = coordinator.run('interactive', int.fn);
            const pbg = coordinator.run('background', bg.fn);
            await tick();
            await coordinator.cancel('background');

            int.release();
            await tick();
            expect(log).toEqual(['int:start', 'int:end', 'bg:start:aborted']);

            bg.release();
            await Promise.all([pint, pbg]);
        });
    });

    describe('nesting', () => {
        it('a run issued from inside an operation runs inline with the same signal instead of waiting for itself', async () => {
            const coordinator = new SessionOperationCoordinator();

            const outcome = coordinator.run('background', async (outer) => {
                const inner = coordinator.run('interactive', async (s) => s);
                const innerSignal = await Promise.race([inner, timeout(300)]);
                return { outer, innerSignal };
            });

            const { outer, innerSignal } = await outcome;
            expect(innerSignal).not.toBe('timeout');
            expect(innerSignal).toBe(outer);
            // O `interactive` aninhado não supera o `background` que o chamou.
            expect(outer.aborted).toBe(false);
        });

        it('a run started from a callback scheduled inside a finished operation is a fresh acquisition', async () => {
            const coordinator = new SessionOperationCoordinator();
            const log: string[] = [];
            let late: Promise<string> | null = null;

            await coordinator.run('background', async () => {
                // O callback herda o contexto assíncrono desta operação, mas
                // dispara depois que ela terminou: não pode rodar inline.
                setTimeout(() => {
                    late = coordinator.run('interactive', async () => { log.push('late:start'); return 'late'; });
                }, 20);
            });

            const blocker = makeOp(log, 'blocker');
            const pblocker = coordinator.run('interactive', blocker.fn);
            await new Promise(resolve => setTimeout(resolve, 60));

            expect(late).not.toBeNull();
            expect(log).toEqual(['blocker:start']);

            blocker.release();
            await pblocker;
            expect(await late!).toBe('late');
            expect(log).toEqual(['blocker:start', 'blocker:end', 'late:start']);
        });
    });
});
