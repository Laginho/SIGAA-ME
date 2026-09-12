/**
 * OBS-003 — critério 5: `removeLegacyLogs` apaga o que os loggers antigos
 * (`sigaa-me.log`, `scraper.log`, `debug_*` na raiz, `OBS-001`/`OBS-004`)
 * deixaram no `userData` de quem atualiza, e nada além disso.
 *
 * `electron/main.ts` roda efeitos de módulo no import (`registerIpcHandlers`
 * inclusive), então cada dependência dele é mockada — mesmo padrão de
 * `updater-consent.test.ts` — para isolar só `removeLegacyLogs`. `fs` é real,
 * numa pasta temporária: o critério é sobre arquivo de verdade no disco.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const harness = vi.hoisted(() => {
    const autoUpdater: any = {
        autoDownload: true,
        autoInstallOnAppQuit: true,
        on: vi.fn(),
        downloadUpdate: vi.fn(async () => {}),
        checkForUpdates: vi.fn(async () => {}),
        quitAndInstall: vi.fn(),
    };
    const dialog: any = {
        showMessageBox: vi.fn(async () => ({ response: 0 })),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        showErrorBox: vi.fn(),
    };
    return { autoUpdater, dialog };
});

const loggerHarness = vi.hoisted(() => {
    const scopes = new Map<string, { info: any; warn: any; error: any }>();
    const makeScope = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    return {
        scopes,
        logger: {
            scope: vi.fn((name: string) => {
                if (!scopes.has(name)) scopes.set(name, makeScope());
                return scopes.get(name)!;
            }),
        },
    };
});
vi.mock('../../electron/services/logger.service', () => ({ logger: loggerHarness.logger }));

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => os.tmpdir()),
        getName: vi.fn(() => 'test-app'),
        setPath: vi.fn(),
        getAppPath: vi.fn(() => '/tmp'),
        isPackaged: true,
        on: vi.fn(),
        whenReady: vi.fn(() => ({ then: vi.fn() })),
        quit: vi.fn(),
        setLoginItemSettings: vi.fn(),
    },
    BrowserWindow: vi.fn(function () { return { webContents: { on: vi.fn(), send: vi.fn() }, on: vi.fn(), loadURL: vi.fn(), loadFile: vi.fn() }; } as any),
    ipcMain: { handle: vi.fn() },
    dialog: harness.dialog,
    Tray: vi.fn(function () { return { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() }; } as any),
    Menu: { buildFromTemplate: vi.fn(() => ({})) },
    session: { defaultSession: { clearStorageData: vi.fn() } },
    shell: { openExternal: vi.fn() },
}));

vi.mock('electron-updater', () => ({ autoUpdater: harness.autoUpdater }));

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => ({ runInBackground: false, syncInterval: 60, openAtLogin: false })),
        saveCredentials: vi.fn(),
        clearCredentials: vi.fn(),
        applySetting: vi.fn(),
        updateSetting: vi.fn(),
        loadCredentials: vi.fn(() => null),
        reset: vi.fn(),
    },
}));
vi.mock('../../electron/services/sigaa.service', () => ({
    SigaaService: vi.fn(function () { return { logout: vi.fn(async () => {}) }; }),
}));
vi.mock('../../electron/services/background-sync.service', () => ({
    BackgroundSyncService: vi.fn(function () { return { start: vi.fn(), stop: vi.fn(), restart: vi.fn(), cancel: vi.fn(async () => {}), syncNow: vi.fn(async () => {}) }; }),
}));
vi.mock('../../electron/services/cache.service', () => ({
    cacheService: { cache: {}, saveCache: vi.fn(), clear: vi.fn(), forgetLastFile: vi.fn() },
}));
vi.mock('../../electron/services/diagnostics.service', () => ({
    diagnosticsService: { clear: vi.fn(async () => {}) },
}));
vi.mock('../../electron/services/account-context.service', () => ({
    getActiveAccount: vi.fn(() => null),
}));

import { removeLegacyLogs } from '../../electron/main';

const root = path.join(os.tmpdir(), `sigaa-me-legacy-cleanup-${process.pid}`);

function plant() {
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'diagnostics'), { recursive: true });
    fs.mkdirSync(path.join(root, 'debug'), { recursive: true });
    fs.writeFileSync(path.join(root, 'sigaa-me.log'), 'legado');
    fs.writeFileSync(path.join(root, 'scraper.log'), 'legado');
    fs.writeFileSync(path.join(root, 'debug_a.html'), '<html></html>');
    fs.writeFileSync(path.join(root, 'debug_b.json'), '{}');
    fs.writeFileSync(path.join(root, 'logs', 'app_2025-01-01.log'), 'legado');
    fs.writeFileSync(path.join(root, 'settings.json'), '{}');
    fs.writeFileSync(path.join(root, 'cache.json'), '{}');
    fs.writeFileSync(path.join(root, 'logs', 'app.log'), 'atual');
    fs.writeFileSync(path.join(root, 'diagnostics', 'x.json'), '{}');
}

const REMOVED = ['sigaa-me.log', 'scraper.log', 'debug_a.html', 'debug_b.json', path.join('logs', 'app_2025-01-01.log')];
const KEPT = ['settings.json', 'cache.json', path.join('logs', 'app.log'), path.join('diagnostics', 'x.json'), 'debug'];

beforeEach(() => {
    loggerHarness.scopes.clear();
    fs.rmSync(root, { recursive: true, force: true });
    plant();
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
});

describe('removeLegacyLogs', () => {
    it('apaga os cinco arquivos legados e não toca em nenhum dos outros', async () => {
        await removeLegacyLogs(root);

        for (const removed of REMOVED) {
            expect(fs.existsSync(path.join(root, removed)), `${removed} deveria ter sido apagado`).toBe(false);
        }
        for (const kept of KEPT) {
            expect(fs.existsSync(path.join(root, kept)), `${kept} não deveria ter sido tocado`).toBe(true);
        }
    });

    it('idempotente: a segunda chamada não lança', async () => {
        await removeLegacyLogs(root);

        await expect(removeLegacyLogs(root)).resolves.toBeUndefined();
    });

    it('unlink rejeitando EPERM resolve mesmo assim e loga uma vez', async () => {
        const real = fs.promises.unlink;
        const target = path.join(root, 'sigaa-me.log');
        const spy = vi.spyOn(fs.promises, 'unlink').mockImplementation(async (file) => {
            if (path.resolve(String(file)) === path.resolve(target)) {
                throw Object.assign(new Error('EPERM: recurso ocupado'), { code: 'EPERM' });
            }
            return real.call(fs.promises, file as never);
        });

        await expect(removeLegacyLogs(root)).resolves.toBeUndefined();

        expect(fs.existsSync(target)).toBe(true);
        const mainScope = loggerHarness.scopes.get('main');
        expect(mainScope?.error).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
