/**
 * SEC-002 — preload dev gate e contrato do `api`.
 *
 * Consequências de tirar a ponte `ipcRenderer` e isolar o `simulateNewFile`:
 *
 * - O `api` exposto via `exposeInMainWorld` passa a ser o único membro em
 *   produção (sem `ipcRenderer`, sem `testApi`). Com `--sigaa-dev`, entra o
 *   `testApi` com `simulateNewFile` — e o `api` **não** tem mais o método.
 * - Os eventos `download-progress` e `background-sync-update` chamam o
 *   callback com **um** argumento (só o dado), e o `unsubscribe` devolvido
 *   desliga exatamente o mesmo `subscription`.
 * - `loadAllNews` envia um único objeto `{ courseId, courseName }` — os dois
 *   argumentos posicionais de hoje são o único canal fora do padrão.
 *
 * Falha hoje: o preload expõe `'ipcRenderer'` (contagem/nomes erram), o `api`
 * tem `simulateNewFile` com o flag, e `loadAllNews` manda dois args.
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
    contextBridgeMock.exposeInMainWorld.mockClear();
    ipcMock.on.mockClear();
    ipcMock.off.mockClear();
    ipcMock.invoke.mockClear();
});

afterEach(() => {
    process.argv = originalArgv;
    vi.clearAllMocks();
});

async function importPreload() {
    await import('../../electron/preload');
}

function exposedNames(): string[] {
    return contextBridgeMock.exposeInMainWorld.mock.calls.map((c: [string, unknown]) => c[0]);
}

function apiObject(): Record<string, any> {
    const call = contextBridgeMock.exposeInMainWorld.mock.calls.find(
        (c: [string, unknown]) => c[0] === 'api'
    );
    expect(call).toBeDefined();
    return call![1] as Record<string, any>;
}

describe('preload dev gate', () => {
    it('sem --sigaa-dev expõe apenas api, sem ipcRenderer e sem simulateNewFile', async () => {
        process.argv = originalArgv.filter(a => a !== '--sigaa-dev');
        await importPreload();

        const names = exposedNames();
        expect(names).toHaveLength(1);
        expect(names[0]).toBe('api');
        expect(names).not.toContain('ipcRenderer');
        expect('simulateNewFile' in apiObject()).toBe(false);
    });

    it('com --sigaa-dev expõe api e testApi; simulateNewFile mora só no testApi', async () => {
        process.argv = [...originalArgv, '--sigaa-dev'];
        await importPreload();

        const names = exposedNames();
        expect(names).toHaveLength(2);
        expect(names).toContain('api');
        expect(names).toContain('testApi');
        expect(names).not.toContain('ipcRenderer');
        expect('simulateNewFile' in apiObject()).toBe(false);

        const testApiCall = contextBridgeMock.exposeInMainWorld.mock.calls.find(
            (c: [string, unknown]) => c[0] === 'testApi'
        );
        expect(testApiCall).toBeDefined();
        const testApi = testApiCall![1] as Record<string, unknown>;
        expect(typeof testApi.simulateNewFile).toBe('function');
    });

    it('onDownloadProgress repassa só o dado e devolve unsubscribe do mesmo subscription', async () => {
        process.argv = originalArgv.filter(a => a !== '--sigaa-dev');
        await importPreload();
        const api = apiObject();

        const cb = vi.fn();
        const unsubscribe = api.onDownloadProgress(cb);

        expect(ipcMock.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
        const call = ipcMock.on.mock.calls.find((c: [string, unknown]) => c[0] === 'download-progress');
        expect(call).toBeDefined();
        const subscription = call![1] as (...args: unknown[]) => void;

        subscription({ fakeEvent: true }, { fileName: 'a', status: 'downloaded' });

        expect(cb).toHaveBeenCalledWith({ fileName: 'a', status: 'downloaded' });
        expect(cb.mock.calls[0].length).toBe(1);

        unsubscribe();
        expect(ipcMock.off).toHaveBeenCalledWith('download-progress', subscription);
    });

    it('onBackgroundSyncUpdate repassa só o dado e devolve unsubscribe do mesmo subscription', async () => {
        process.argv = originalArgv.filter(a => a !== '--sigaa-dev');
        await importPreload();
        const api = apiObject();

        const cb = vi.fn();
        const unsubscribe = api.onBackgroundSyncUpdate(cb);

        expect(ipcMock.on).toHaveBeenCalledWith('background-sync-update', expect.any(Function));
        const call = ipcMock.on.mock.calls.find((c: [string, unknown]) => c[0] === 'background-sync-update');
        expect(call).toBeDefined();
        const subscription = call![1] as (...args: unknown[]) => void;

        subscription({ fakeEvent: true }, { courses: [], notifications: [], timestamp: 1 });

        expect(cb).toHaveBeenCalledWith({ courses: [], notifications: [], timestamp: 1 });
        expect(cb.mock.calls[0].length).toBe(1);

        unsubscribe();
        expect(ipcMock.off).toHaveBeenCalledWith('background-sync-update', subscription);
    });

    it('loadAllNews envia um único objeto CourseRequest', async () => {
        process.argv = originalArgv.filter(a => a !== '--sigaa-dev');
        await importPreload();
        const api = apiObject();

        await api.loadAllNews('1', 'X');
        expect(ipcMock.invoke).toHaveBeenCalledWith('load-all-news', { courseId: '1', courseName: 'X' });
    });
});