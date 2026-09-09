/**
 * DATA-002 — as duas transações de sessão, pelo ponto de entrada real: os
 * handlers `logout` e `clear-all-data` registrados por `registerIpcHandlers`.
 *
 * `electron` é mockado no padrão de `ipc-validation.test.ts` (o `ipcMain.handle`
 * guarda canal → handler num `Map`; o `dialog.showMessageBox` responde o que o
 * teste mandar). `fs` é um `Map` em memória, só com o que o handler precisa
 * para apagar os `debug_*` do `userData`. Todo serviço entra pelas deps como
 * espião que registra a ordem das chamadas — a ordem **é** o critério "clear-all
 * não pode correr com uma escrita em background": nada destrutivo antes de a
 * sessão estar fechada, e a credencial some antes de qualquer outra coisa,
 * para que nenhum sync novo consiga começar no intervalo.
 *
 * Vermelho hoje pelo motivo certo: os dois handlers só chamam
 * `clearCredentials` + `sigaaService.logout`, não abrem dialog, e `IpcDeps` não
 * tem `cache`, `logger`, `userDataPath`, `clearBrowserStorage`
 * nem `backgroundSync.cancel`.
 *
 * Contrato e decisões: `.scratch/04-fase3-fronteiras-de-confianca/issues/06-DATA-002-*.md`.
 */
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/errors';
import { registerIpcHandlers } from '../../electron/ipc/register-handlers';

const electronMock = vi.hoisted(() => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>();
    const dialogState = { response: 0, calls: [] as { win: unknown; options: Record<string, unknown> }[] };
    const ipcMain = {
        handle: vi.fn((channel: string, fn: (event: unknown, payload: unknown) => unknown) => {
            handlers.set(channel, fn);
        }),
    };
    const app = {
        isPackaged: true,
        setLoginItemSettings: vi.fn(),
        getAppPath: vi.fn(() => '/app/app'),
    };
    const dialog = {
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        showMessageBox: vi.fn(async (win: unknown, options: Record<string, unknown>) => {
            dialogState.calls.push({ win, options });
            return { response: dialogState.response, checkboxChecked: false };
        }),
    };
    return { handlers, dialogState, ipcMain, app, dialog };
});

const fsMock = vi.hoisted(() => {
    const files = new Map<string, string>();
    const unlinked: string[] = [];
    const api = {
        existsSync: vi.fn((file: string) => files.has(file)),
        readFileSync: vi.fn((file: string) => files.get(file) ?? ''),
        writeFileSync: vi.fn((file: string, content: string) => { files.set(file, String(content)); }),
        readdirSync: vi.fn((dir: string) => {
            const prefix = dir.endsWith(path.sep) ? dir : dir + path.sep;
            return [...files.keys()]
                .filter(file => file.startsWith(prefix) && !file.slice(prefix.length).includes(path.sep))
                .map(file => file.slice(prefix.length));
        }),
        unlinkSync: vi.fn((file: string) => { unlinked.push(file); files.delete(file); }),
        rmSync: vi.fn((target: string) => {
            unlinked.push(target);
            for (const file of [...files.keys()]) {
                if (file === target || file.startsWith(target + path.sep)) files.delete(file);
            }
        }),
    };
    return { files, unlinked, api };
});

vi.mock('electron', () => ({
    ipcMain: electronMock.ipcMain,
    app: electronMock.app,
    dialog: electronMock.dialog,
}));
vi.mock('node:fs', () => ({ default: fsMock.api, ...fsMock.api }));
vi.mock('fs', () => ({ default: fsMock.api, ...fsMock.api }));

const USER_DATA = path.join('C:', 'ud');
const WIN = { webContents: { id: 7 } };
const trustedEvent = {
    sender: { id: 7 },
    senderFrame: { url: 'http://localhost:5173/', parent: null },
};

function deferred<T = void>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Deps como espiões que anotam a ordem. `cancel` e os passos assíncronos
 * resolvem num tick seguinte, para que um handler que não os aguarde apareça
 * como violação de ordem, não como coincidência.
 */
function makeDeps(overrides: { settings?: Record<string, unknown> } = {}) {
    const order: string[] = [];
    const record = (name: string) => order.push(name);
    const settings = { theme: 'light', lastDownloadPath: null, openAtLogin: false, runInBackground: true, syncInterval: 60, ...overrides.settings };
    const deps = {
        sigaaService: {
            login: vi.fn(async () => ok({ id: 'a'.repeat(64), name: 'ALUNO' })),
            getCourses: vi.fn(async () => ok({ courses: [] })),
            getCourseFiles: vi.fn(async () => ok({ files: [], news: [] })),
            downloadFile: vi.fn(async () => ok({ filePath: 'x' })),
            downloadAllFiles: vi.fn(async () => ok({ downloaded: 0, skipped: 0, failed: 0, results: [] })),
            getNewsDetail: vi.fn(async () => ok({ title: 'T', date: 'D', notification: '', content: '' })),
            loadAllNews: vi.fn(async () => ok([])),
            logout: vi.fn(async () => { await tick(); record('sigaaService.logout'); }),
            clearDiagnostics: vi.fn(() => { record('sigaaService.clearDiagnostics'); }),
        },
        persistence: {
            getSettings: vi.fn(() => ({ ...settings })),
            applySetting: vi.fn(),
            updateSetting: vi.fn(),
            saveCredentials: vi.fn(),
            clearCredentials: vi.fn(() => { record('persistence.clearCredentials'); }),
            loadCredentials: vi.fn(() => null),
            reset: vi.fn(() => { record('persistence.reset'); }),
        },
        backgroundSync: {
            restart: vi.fn(),
            stop: vi.fn(() => { record('backgroundSync.stop'); }),
            start: vi.fn(() => { record('backgroundSync.start'); }),
            cancel: vi.fn(async () => { await tick(); record('backgroundSync.cancel'); }),
        },
        cache: { clear: vi.fn(() => { record('cache.clear'); }) },
        logger: { clear: vi.fn(async () => { await tick(); record('logger.clear'); }) },
        userDataPath: USER_DATA,
        clearBrowserStorage: vi.fn(async () => { await tick(); record('clearBrowserStorage'); }),
        getWindow: () => WIN,
        allowedOrigin: 'http://localhost:5173',
        isPackaged: true,
        simulateNewFile: vi.fn(async () => true),
    };
    return { deps, order };
}

type Deps = ReturnType<typeof makeDeps>['deps'];

async function invoke(channel: string, payload: unknown = undefined) {
    const handler = electronMock.handlers.get(channel);
    expect(handler, `handler de ${channel}`).toBeDefined();
    return await handler!(trustedEvent, payload);
}

const DESTRUCTIVE = [
    'cache.clear', 'persistence.reset', 'logger.clear', 'sigaaService.clearDiagnostics',
    'clearBrowserStorage',
] as const;

function destructiveCalls(deps: Deps) {
    return {
        'cache.clear': deps.cache.clear,
        'persistence.reset': deps.persistence.reset,
        'logger.clear': deps.logger.clear,
        'sigaaService.clearDiagnostics': deps.sigaaService.clearDiagnostics,
        'clearBrowserStorage': deps.clearBrowserStorage,
    };
}

function plantUserData() {
    fsMock.files.set(path.join(USER_DATA, 'debug_login_page.html'), '<html>');
    fsMock.files.set(path.join(USER_DATA, 'debug_portal_fail_540316.html'), '<html>');
    fsMock.files.set(path.join(USER_DATA, 'debug_courses.json'), '[]');
    fsMock.files.set(path.join(USER_DATA, 'cache.json'), '{}');
    fsMock.files.set(path.join(USER_DATA, 'settings.json'), '{}');
    fsMock.files.set(path.join(USER_DATA, 'keep.txt'), 'não sou diagnóstico');
}

let deps: Deps;
let order: string[];

beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.dialogState.calls.length = 0;
    electronMock.dialogState.response = 0;
    fsMock.files.clear();
    fsMock.unlinked.length = 0;
    vi.clearAllMocks();
    ({ deps, order } = makeDeps());
    registerIpcHandlers(deps as never);
});

describe('clear-all-data', () => {
    describe('confirmation', () => {
        it('asks first, in the main process, naming the downloads that are kept; the safe button is the default', async () => {
            electronMock.dialogState.response = 1;

            await invoke('clear-all-data');

            expect(electronMock.dialogState.calls).toHaveLength(1);
            const { win, options } = electronMock.dialogState.calls[0];
            expect(win).toBe(WIN);
            const text = `${options.message ?? ''} ${options.detail ?? ''}`;
            expect(text).toMatch(/arquivos baixados/i);
            expect(text).toMatch(/n[aã]o ser[aã]o apagados/i);
            expect(options.buttons).toHaveLength(2);
            expect(options.defaultId).toBe(options.cancelId);
        });

        it('declining returns CANCELLED and touches nothing — no service, no file, no session', async () => {
            electronMock.dialogState.response = 1;
            plantUserData();

            const result = await invoke('clear-all-data');

            expect(result).toEqual({ success: false, error: { code: 'CANCELLED', message: expect.any(String) } });
            expect(order).toEqual([]);
            expect(deps.persistence.clearCredentials).not.toHaveBeenCalled();
            expect(deps.backgroundSync.stop).not.toHaveBeenCalled();
            expect(deps.backgroundSync.cancel).not.toHaveBeenCalled();
            expect(deps.sigaaService.logout).not.toHaveBeenCalled();
            for (const fn of Object.values(destructiveCalls(deps))) expect(fn).not.toHaveBeenCalled();
            expect(fsMock.unlinked).toEqual([]);
            expect(electronMock.app.setLoginItemSettings).not.toHaveBeenCalled();
        });
    });

    describe('order', () => {
        it('closes the session before anything destructive: credential first, then stop + drain the sync, then logout', async () => {
            await invoke('clear-all-data');

            const at = (name: string) => {
                const i = order.indexOf(name);
                expect(i, `${name} não foi chamado`).toBeGreaterThanOrEqual(0);
                return i;
            };
            const credential = at('persistence.clearCredentials');
            const stop = at('backgroundSync.stop');
            const cancel = at('backgroundSync.cancel');
            const logout = at('sigaaService.logout');

            expect(credential).toBeLessThan(cancel);
            expect(stop).toBeLessThan(cancel);
            expect(cancel).toBeLessThan(logout);
            for (const name of DESTRUCTIVE) expect(at(name), `${name} antes de fechar a sessão`).toBeGreaterThan(logout);
            expect(at('backgroundSync.start')).toBe(order.length - 1);
        });

        it('is the credential file, not the scheduler, that blocks a sync from starting in the gap', async () => {
            // `syncNow` aborta em `loadCredentials() === null`. Se o arquivo
            // ainda existisse quando `cancel` resolve, o próximo tick do
            // agendador (ou o tray) começaria um sync novo por baixo da limpeza.
            await invoke('clear-all-data');

            expect(order.indexOf('persistence.clearCredentials')).toBe(0);
        });
    });

    describe('what is removed', () => {
        it('removes every store, every diagnostic capture and the browser partition, once each, and returns ok', async () => {
            plantUserData();

            const result = await invoke('clear-all-data');

            expect(result).toEqual({ success: true, data: undefined });
            for (const [name, fn] of Object.entries(destructiveCalls(deps))) {
                expect(fn, name).toHaveBeenCalledTimes(1);
            }
            expect(deps.sigaaService.logout).toHaveBeenCalledTimes(1);
            expect(deps.backgroundSync.start).toHaveBeenCalledTimes(1);

            const removed = fsMock.unlinked.map(f => path.basename(f)).sort();
            expect(removed).toEqual(['debug_courses.json', 'debug_login_page.html', 'debug_portal_fail_540316.html']);
            expect(fsMock.files.has(path.join(USER_DATA, 'keep.txt'))).toBe(true);
            // cache.json e settings.json são dos serviços (`cache.clear`,
            // `persistence.reset`), não do handler: ele não os toca por caminho.
            expect(fsMock.unlinked.some(f => /cache\.json|settings\.json/.test(f))).toBe(false);
        });

        it('a userData with no captures is not an error', async () => {
            const result = await invoke('clear-all-data');

            expect(result).toEqual({ success: true, data: undefined });
            expect(fsMock.unlinked).toEqual([]);
        });

        it('returns only after the asynchronous steps have finished', async () => {
            const storage = deferred();
            deps.clearBrowserStorage.mockImplementation(async () => { await storage.promise; order.push('clearBrowserStorage'); });
            let settled = false;

            const pending = invoke('clear-all-data').then(r => { settled = true; return r; });
            for (let i = 0; i < 10; i++) await tick();

            expect(settled).toBe(false);
            storage.resolve();
            const result = await pending;
            expect(result).toEqual({ success: true, data: undefined });
        });

        it('disables the OS login item when it was enabled — a "first launch" does not start with Windows', async () => {
            ({ deps, order } = makeDeps({ settings: { openAtLogin: true } }));
            electronMock.handlers.clear();
            registerIpcHandlers(deps as never);

            await invoke('clear-all-data');

            expect(electronMock.app.setLoginItemSettings).toHaveBeenCalledWith(expect.objectContaining({ openAtLogin: false }));
        });
    });

    describe('partial failure', () => {
        it('a failing step does not stop the others; the result is STORAGE, quotes the failure and says where to delete by hand', async () => {
            plantUserData();
            deps.cache.clear.mockImplementation(() => { throw new Error('EPERM: cache.json em uso'); });

            const result = await invoke('clear-all-data');

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.error.code).toBe('STORAGE');
            expect(result.error.message).toContain('EPERM: cache.json em uso');
            expect(result.error.message).toContain(USER_DATA);

            for (const [name, fn] of Object.entries(destructiveCalls(deps))) {
                expect(fn, `${name} deixou de rodar por causa do cache`).toHaveBeenCalledTimes(1);
            }
            expect(fsMock.unlinked.map(f => path.basename(f)).sort()).toEqual([
                'debug_courses.json', 'debug_login_page.html', 'debug_portal_fail_540316.html',
            ]);
        });

        it('collects more than one failure in the same message', async () => {
            deps.persistence.reset.mockImplementation(() => { throw new Error('settings.json: EACCES'); });
            deps.logger.clear.mockImplementation(async () => { throw new Error('logs/: EBUSY'); });

            const result = await invoke('clear-all-data');

            expect(result.success).toBe(false);
            if (result.success) return;
            expect(result.error.code).toBe('STORAGE');
            expect(result.error.message).toContain('settings.json: EACCES');
            expect(result.error.message).toContain('logs/: EBUSY');
        });
    });
});

describe('logout', () => {
    it('clears the credential first, drains the sync, then closes the session — and leaves the scheduler and the stores alone', async () => {
        const result = await invoke('logout');

        expect(result).toEqual({ success: true, data: undefined });
        expect(order).toEqual(['persistence.clearCredentials', 'backgroundSync.cancel', 'sigaaService.logout']);
        expect(deps.backgroundSync.stop).not.toHaveBeenCalled();
        expect(deps.backgroundSync.start).not.toHaveBeenCalled();
        for (const [name, fn] of Object.entries(destructiveCalls(deps))) {
            expect(fn, `${name} não é coisa de logout`).not.toHaveBeenCalled();
        }
        expect(electronMock.dialogState.calls).toEqual([]);
    });

    it('a credential that cannot be removed is reported as STORAGE instead of a successful logout — the session is still closed', async () => {
        deps.persistence.clearCredentials.mockImplementation(() => { throw new Error('credentials.json: EPERM'); });

        const result = await invoke('logout');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('STORAGE');
        expect(result.error.message).toContain('credentials.json: EPERM');
        expect(deps.backgroundSync.cancel).toHaveBeenCalledTimes(1);
        expect(deps.sigaaService.logout).toHaveBeenCalledTimes(1);
    });
});

describe('login-request without remember-me', () => {
    it('a credential file that cannot be removed is reported as STORAGE, like a credential that cannot be saved', async () => {
        deps.persistence.clearCredentials.mockImplementation(() => { throw new Error('credentials.json: EPERM'); });

        const result = await invoke('login-request', { username: 'aluno', password: 'senha', rememberMe: false });

        expect(deps.sigaaService.login).toHaveBeenCalledWith('aluno', 'senha');
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('STORAGE');
        expect(result.error.message).toContain('credentials.json: EPERM');
    });
});
