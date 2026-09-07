import type { BrowserWindowConstructorOptions, IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
    const exposed = new Map<string, Record<string, unknown>>();
    const files = new Map<string, string>();
    const syncNow = vi.fn(async () => {});
    const app = {
        isPackaged: true,
        getPath: vi.fn(() => 'dev-001-user-data'),
        getName: vi.fn(() => 'SIGAA-ME'),
        getAppPath: vi.fn(() => '/app'),
        setPath: vi.fn(), on: vi.fn(), quit: vi.fn(),
        whenReady: () => Promise.resolve(),
    };
    const BrowserWindow = vi.fn(function (_options: BrowserWindowConstructorOptions) {
        return {
            webContents: { id: 7, on: vi.fn(), setWindowOpenHandler: vi.fn(), send: vi.fn() },
            on: vi.fn(), loadURL: vi.fn(), loadFile: vi.fn(), show: vi.fn(), hide: vi.fn(),
        };
    });
    const buildFromTemplate = vi.fn((template: MenuItemConstructorOptions[]) => template);
    const ipcRenderer = {
        invoke: vi.fn(async (channel: string, ...args: unknown[]) => {
            const handler = handlers.get(channel);
            if (!handler) throw new Error(`No handler registered for '${channel}'`);
            // Electron supplies this event, never the renderer payload.
            const event = {
                sender: { id: 7 },
                senderFrame: { url: 'file:///app/dist/index.html', parent: null },
            } as unknown as IpcMainInvokeEvent;
            return handler(event, ...args);
        }),
        on: vi.fn(), off: vi.fn(),
    };
    const contextBridge = {
        exposeInMainWorld: vi.fn((name: string, value: Record<string, unknown>) => {
            exposed.set(name, value);
        }),
    };
    const fs = {
        existsSync: vi.fn((file: string) => files.has(file)),
        readFileSync: vi.fn((file: string) => files.get(file) ?? ''),
        writeFileSync: vi.fn((file: string, value: string) => files.set(file, String(value))),
        mkdirSync: vi.fn(),
        createWriteStream: vi.fn(() => ({ writable: false })),
    };
    const mainElectron = {
        app, BrowserWindow,
        ipcMain: { handle: vi.fn((name: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => handlers.set(name, handler)) },
        Menu: { buildFromTemplate },
        Tray: vi.fn(function () { return { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() }; }),
        dialog: { showErrorBox: vi.fn() },
        session: { defaultSession: { clearStorageData: vi.fn() } },
        shell: { openExternal: vi.fn() },
    };
    return { handlers, exposed, files, syncNow, app, BrowserWindow, buildFromTemplate, ipcRenderer, contextBridge, fs, mainElectron };
});

vi.mock('node:fs', () => ({ ...harness.fs, default: harness.fs }));
vi.mock('fs', () => ({ ...harness.fs, default: harness.fs }));
vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('electron-updater', () => ({
    autoUpdater: { on: vi.fn(), checkForUpdates: vi.fn(async () => {}) },
}));
vi.mock('../../electron/services/logger.service', () => ({ logger: { clear: vi.fn() } }));
vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: { getSettings: vi.fn(() => ({ runInBackground: false })) },
}));
vi.mock('../../electron/services/sigaa.service', () => ({
    SigaaService: vi.fn(function () { return { logout: vi.fn(async () => {}) }; }),
}));
vi.mock('../../electron/services/background-sync.service', () => ({
    BackgroundSyncService: vi.fn(function () { return { start: vi.fn(), syncNow: harness.syncNow }; }),
}));

const originalArgv = process.argv;
const originalEnv = { ...process.env };
const originalConsole = { log: console.log, error: console.error, warn: console.warn };

afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
    Object.assign(console, originalConsole);
    vi.clearAllMocks();
});

async function bootMain(isPackaged: boolean) {
    vi.resetModules();
    vi.doMock('electron', () => harness.mainElectron);
    harness.app.isPackaged = isPackaged;
    harness.handlers.clear();
    harness.files.clear();
    harness.BrowserWindow.mockClear();
    harness.buildFromTemplate.mockClear();
    harness.syncNow.mockClear();
    Object.assign(console, originalConsole);
    process.argv = ['electron', '.', '--sigaa-dev'];
    delete process.env.VITE_DEV_SERVER_URL;
    await import('../../electron/main');
    const options = harness.BrowserWindow.mock.calls[0]?.[0];
    expect(options).toBeDefined();
    expect(options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    return options.webPreferences?.additionalArguments ?? [];
}

async function loadPreload(args: string[]) {
    vi.resetModules();
    // A sandboxed preload has no `app` export. Packaging authority belongs to main.
    vi.doMock('electron', () => ({ contextBridge: harness.contextBridge, ipcRenderer: harness.ipcRenderer }));
    harness.exposed.clear();
    process.argv = ['electron-renderer', ...args];
    await import('../../electron/preload');
    expect(harness.exposed.get('api')).toBeDefined();
    expect(harness.exposed.get('api')).not.toHaveProperty('simulateNewFile');
    expect(harness.exposed.has('ipcRenderer')).toBe(false);
}

describe('DEV-001: packaging controls the cache mutation bridge', () => {
    it.each(['production', 'development'])(
        'packaged preload rejects --sigaa-dev with NODE_ENV=%s, while unpackaged E2E still works',
        async (nodeEnv) => {
            process.env.NODE_ENV = nodeEnv;
            const devArgs = await bootMain(false);
            const { cacheService } = await import('../../electron/services/cache.service');
            const { setActiveAccount } = await import('../../electron/services/account-context.service');
            const account = 'a'.repeat(64);
            const otherAccount = 'b'.repeat(64);
            setActiveAccount(account);
            cacheService.updateCourseState(account, '101', ['1', '2'], ['9']);
            cacheService.updateCourseState(otherAccount, '101', ['3'], ['8']);
            expect(harness.buildFromTemplate.mock.calls[0][0].some(item => item.label === '[Dev] Simular Arquivo Novo')).toBe(true);
            expect(harness.handlers.has('test-simulate-new-file')).toBe(true);

            await loadPreload(devArgs);
            const testApi = harness.exposed.get('testApi');
            expect(testApi).toBeDefined();
            // This is the existing boolean contract, read in main, its handler and services.
            const simulate = testApi?.simulateNewFile as (() => Promise<boolean>) | undefined;
            expect(typeof simulate).toBe('function');
            expect(await simulate!()).toBe(true);
            expect(cacheService.getCourseState(account, '101')).toEqual({ files: ['1'], news: ['9'] });
            expect(cacheService.getCourseState(otherAccount, '101')).toEqual({ files: ['3'], news: ['8'] });
            expect(harness.syncNow).toHaveBeenCalledTimes(1);
            setActiveAccount(null);
            expect(await simulate!()).toBe(false);
            setActiveAccount('c'.repeat(64));
            expect(await simulate!()).toBe(false);
            expect(harness.syncNow).toHaveBeenCalledTimes(1);

            const productionArgs = await bootMain(true);
            expect(productionArgs).not.toContain('--sigaa-dev');
            expect(harness.buildFromTemplate.mock.calls[0][0].filter(item => item.label).map(item => item.label))
                .toEqual(['Abrir SIGAA-ME', 'Sincronizar Agora', 'Sair']);
            expect(harness.handlers.has('test-simulate-new-file')).toBe(false);
            await loadPreload(productionArgs);
            expect(harness.exposed.has('testApi')).toBe(false);

            const cacheBefore = new Map(harness.files);
            // Deliberately supply the flag at the preload boundary too: main already
            // omits it, but the accepted requirement is that argv alone cannot grant access.
            await loadPreload([...productionArgs, '--sigaa-dev']);
            expect.soft(harness.exposed.has('testApi')).toBe(false);
            expect(harness.files).toEqual(cacheBefore);
            expect(harness.syncNow).not.toHaveBeenCalled();
        },
    );
});
