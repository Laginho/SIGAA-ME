/**
 * Verifies that the preload bridge only exposes `simulateNewFile` when the
 * renderer was launched with `--sigaa-dev` in process.argv (i.e. not in
 * production). Uses vi.resetModules + fresh import per scenario so the
 * top-level side effects of preload.ts run under different argv states.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const contextBridgeMock = {
    exposeInMainWorld: vi.fn(),
};

const ipcMock = {
    on: vi.fn(),
    off: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
};

vi.mock('electron', () => ({
    contextBridge: contextBridgeMock,
    ipcRenderer: ipcMock,
}));

let originalArgv: string[];

beforeEach(() => {
    originalArgv = process.argv;
    vi.resetModules();
});

afterEach(() => {
    process.argv = originalArgv;
    vi.clearAllMocks();
});

describe('preload dev gate', () => {
    it('exposes simulateNewFile when --sigaa-dev is present', async () => {
        process.argv = [...originalArgv, '--sigaa-dev'];
        await import('../../electron/preload');

        const apiCall = contextBridgeMock.exposeInMainWorld.mock.calls.find(
            (call: [string, unknown]) => call[0] === 'api'
        );
        expect(apiCall).toBeDefined();
        const api = apiCall![1] as Record<string, unknown>;
        expect(typeof api.simulateNewFile).toBe('function');
    });

    it('does not expose simulateNewFile when --sigaa-dev is absent', async () => {
        process.argv = originalArgv.filter(a => a !== '--sigaa-dev');
        await import('../../electron/preload');

        const apiCall = contextBridgeMock.exposeInMainWorld.mock.calls.find(
            (call: [string, unknown]) => call[0] === 'api'
        );
        expect(apiCall).toBeDefined();
        const api = apiCall![1] as Record<string, unknown>;
        expect('simulateNewFile' in api).toBe(false);
    });
});
