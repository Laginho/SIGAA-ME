import { describe, it, expect, beforeEach, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const autoUpdater: any = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    on: vi.fn((event: string, cb: (...a: any[]) => any) => {
      handlers.set(event, cb);
    }),
    downloadUpdate: vi.fn(async () => {}),
    checkForUpdates: vi.fn(async () => {}),
    checkForUpdatesAndNotify: vi.fn(async () => {}),
    quitAndInstall: vi.fn(),
  };
  const dialog: any = {
    showMessageBox: vi.fn(async () => ({ response: 0 } as any)),
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] } as any)),
    showErrorBox: vi.fn(),
  };
  return { handlers, autoUpdater, dialog };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
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
}));

vi.mock('electron-updater', () => ({
  autoUpdater: harness.autoUpdater,
}));

// Prevent side-effects from service modules at import time
vi.mock('../../electron/services/persistence.service', () => ({
  persistenceService: {
    getSettings: vi.fn(() => ({ runInBackground: false, syncInterval: 60, openAtLogin: false })),
    saveCredentials: vi.fn(),
    clearCredentials: vi.fn(),
    applySetting: vi.fn(),
  },
}));
vi.mock('../../electron/services/sigaa.service', () => ({
  SigaaService: vi.fn(function () { return { logout: vi.fn(async () => {}) }; }),
}));
vi.mock('../../electron/services/background-sync.service', () => ({
  BackgroundSyncService: vi.fn(function () { return { start: vi.fn(), restart: vi.fn(), syncNow: vi.fn(async () => {}) }; }),
}));
vi.mock('../../electron/services/cache.service', () => ({
  cacheService: { cache: {}, saveCache: vi.fn() },
}));

import { setupAutoUpdater } from '../../electron/main';

function getHandler(event: string) {
  return harness.handlers.get(event);
}

describe('updater consent', () => {
  beforeEach(() => {
    harness.handlers.clear();
    harness.autoUpdater.on.mockClear();
    harness.autoUpdater.downloadUpdate.mockClear();
    harness.autoUpdater.checkForUpdates.mockClear();
    harness.autoUpdater.checkForUpdatesAndNotify.mockClear();
    harness.autoUpdater.quitAndInstall.mockClear();
    harness.autoUpdater.autoDownload = true;
    harness.autoUpdater.autoInstallOnAppQuit = true;
    harness.dialog.showMessageBox.mockReset();
    harness.dialog.showMessageBox.mockResolvedValue({ response: 0 } as any);
  });

  it('disables autoDownload and autoInstallOnAppQuit', () => {
    setupAutoUpdater();
    expect(harness.autoUpdater.autoDownload).toBe(false);
    expect(harness.autoUpdater.autoInstallOnAppQuit).toBe(false);
  });

  it('calls checkForUpdates and never checkForUpdatesAndNotify', () => {
    setupAutoUpdater();
    expect(harness.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(harness.autoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
  });

  it('update-available: consent accept (response 0) triggers downloadUpdate', async () => {
    setupAutoUpdater();
    harness.dialog.showMessageBox.mockResolvedValue({ response: 0 } as any);
    const handler = getHandler('update-available');
    expect(handler).toBeDefined();
    handler({ version: '9.9.9' });
    // flush microtasks: dialog.then + downloadUpdate
    await new Promise((r) => setTimeout(r, 0));
    await Promise.resolve();
    expect(harness.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('update-available: consent decline (response 1) does not download', async () => {
    setupAutoUpdater();
    harness.dialog.showMessageBox.mockResolvedValue({ response: 1 } as any);
    const handler = getHandler('update-available');
    handler({ version: '9.9.9' });
    await new Promise((r) => setTimeout(r, 0));
    expect(harness.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('does not produce unhandled rejection when showMessageBox rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupAutoUpdater();
    harness.dialog.showMessageBox.mockRejectedValue(new Error('dialog fail'));
    const handler = getHandler('update-available');

    // Should not throw / reject
    let threw = false;
    try {
      handler({ version: '9.9.9' });
      await new Promise((r) => setTimeout(r, 10));
      await Promise.resolve();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // Unhandled rejection would cause vitest to fail; also assert catch logged
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[Updater] Dialog failed:'), expect.any(Error));
    errSpy.mockRestore();

    // Also pin second dialog chain
    errSpy.mockImplementation(() => {});
    const errSpy2 = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.dialog.showMessageBox.mockRejectedValue(new Error('dialog fail 2'));
    const handler2 = getHandler('update-downloaded');
    expect(handler2).toBeDefined();
    threw = false;
    try {
      handler2();
      await new Promise((r) => setTimeout(r, 10));
    } catch { threw = true; }
    expect(threw).toBe(false);
    expect(errSpy2).toHaveBeenCalledWith(expect.stringContaining('[Updater] Dialog failed:'), expect.any(Error));
    errSpy2.mockRestore();
  });
});
