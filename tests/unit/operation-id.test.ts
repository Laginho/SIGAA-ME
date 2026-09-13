/**
 * OBS-002 — carimbo de operação para correlacionar linhas de log.
 *
 * `runOperation`/`currentOperationId` (módulo, `AsyncLocalStorage` próprio,
 * sem import do logger — o coordenador não conhece o logger) e a integração
 * com `SessionOperationCoordinator.run()`: toda operação que passa por
 * `start()` ganha um id; a chamada aninhada do CONC-001 (que roda inline, sem
 * passar por `start()` de novo) herda o id de fora só por estar no mesmo
 * encadeamento assíncrono.
 */
import { describe, expect, it } from 'vitest';
import {
    SessionOperationCoordinator,
    currentOperationId,
    runOperation,
} from '../../electron/services/session-operation-coordinator.service';

describe('currentOperationId() / runOperation() (OBS-002)', () => {
    it('is undefined outside any operation', () => {
        expect(currentOperationId()).toBeUndefined();
    });

    it('is a defined, non-empty id inside runOperation, and undefined again after it resolves', async () => {
        let seenInside: string | undefined;

        await runOperation('test-op', async () => {
            seenInside = currentOperationId();
        });

        expect(seenInside).toBeTruthy();
        expect(currentOperationId()).toBeUndefined();
    });

    it('two sequential runOperation calls get different ids', async () => {
        const first = await runOperation('a', async () => currentOperationId());
        const second = await runOperation('b', async () => currentOperationId());

        expect(first).not.toBe(second);
    });

    it('two concurrent runOperation calls each keep their own stable id throughout', async () => {
        const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
        const seenA: (string | undefined)[] = [];
        const seenB: (string | undefined)[] = [];

        const a = runOperation('a', async () => {
            seenA.push(currentOperationId());
            await tick();
            seenA.push(currentOperationId());
        });
        const b = runOperation('b', async () => {
            seenB.push(currentOperationId());
            await tick();
            seenB.push(currentOperationId());
        });

        await Promise.all([a, b]);

        expect(seenA[0]).toBe(seenA[1]);
        expect(seenB[0]).toBe(seenB[1]);
        expect(seenA[0]).not.toBe(seenB[0]);
    });
});

describe('SessionOperationCoordinator.run() carimba a operação (OBS-002)', () => {
    it('an operation run through the coordinator sees a defined operation id inside fn', async () => {
        const coordinator = new SessionOperationCoordinator();

        const id = await coordinator.run('background', async () => currentOperationId());

        expect(id).toBeTruthy();
    });

    it('two operations run one after another through the queue get different ids', async () => {
        const coordinator = new SessionOperationCoordinator();

        const first = await coordinator.run('interactive', async () => currentOperationId());
        const second = await coordinator.run('interactive', async () => currentOperationId());

        expect(first).not.toBe(second);
    });

    it('a nested run() (reentrant, CONC-001) keeps the outer operation id instead of minting a new one', async () => {
        const coordinator = new SessionOperationCoordinator();

        const { outer, inner } = await coordinator.run('background', async () => {
            const outerId = currentOperationId();
            const innerId = await coordinator.run('interactive', async () => currentOperationId());
            return { outer: outerId, inner: innerId };
        });

        expect(outer).toBeTruthy();
        expect(inner).toBe(outer);
    });
});
