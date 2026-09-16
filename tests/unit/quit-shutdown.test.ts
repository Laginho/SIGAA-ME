import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as os from 'os';

/**
 * BUG-018: "Sair" do tray fazia `isQuitting = true; app.quit()`, e o handler
 * de `before-quit` só roda o desligamento quando `!isQuitting` — sair pelo
 * tray pulava `sigaaService.logout()` e `logger.flush()` por completo.
 */

const harness = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const quit = vi.fn(() => {
    const handler = handlers.get('before-quit');
    if (handler) handler({ preventDefault: vi.fn() });
  });
  const buildFromTemplate = vi.fn((template: any[]) => template);
  return { handlers, quit, buildFromTemplate };
});

const loggerHarness = vi.hoisted(() => {
  const flush = vi.fn(async () => {});
  const scopes = new Map<string, { info: any; warn: any; error: any }>();
  const makeScope = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  return {
    flush,
    logger: {
      scope: vi.fn((name: string) => {
        if (!scopes.has(name)) scopes.set(name, makeScope());
        return scopes.get(name)!;
      }),
      flush,
    },
  };
});
vi.mock('../../electron/services/logger.service', () => ({ logger: loggerHarness.logger }));

const sigaaHarness = vi.hoisted(() => ({
  logout: vi.fn(async () => {}),
}));
vi.mock('../../electron/services/sigaa.service', () => ({
  SigaaService: vi.fn(function () { return { logout: sigaaHarness.logout }; }),
}));

// A sondagem do Chrome no `whenReady` roda `reg query`/`which` de verdade;
// aqui o `whenReady` dispara na hora para montar o tray, então precisa disto.
vi.mock('child_process', () => ({ execSync: vi.fn() }));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
    getName: vi.fn(() => 'test-app'),
    setPath: vi.fn(),
    getAppPath: vi.fn(() => '/tmp'),
    isPackaged: true,
    on: vi.fn((event: string, cb: (...a: any[]) => any) => { harness.handlers.set(event, cb); }),
    // Dispara o callback na hora, para montar o tray durante o import.
    whenReady: vi.fn(() => ({ then: (cb: () => void) => { cb(); } })),
    quit: harness.quit,
    setLoginItemSettings: vi.fn(),
  },
  BrowserWindow: vi.fn(function () {
    return {
      webContents: { on: vi.fn(), setWindowOpenHandler: vi.fn(), send: vi.fn() },
      on: vi.fn(), loadURL: vi.fn(), loadFile: vi.fn(), show: vi.fn(), hide: vi.fn(),
    };
  } as any),
  ipcMain: { handle: vi.fn() },
  dialog: { showErrorBox: vi.fn(), showMessageBox: vi.fn(async () => ({ response: 1 })) },
  shell: { openExternal: vi.fn() },
  Tray: vi.fn(function () { return { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() }; } as any),
  Menu: { buildFromTemplate: harness.buildFromTemplate },
}));

vi.mock('electron-updater', () => ({
  autoUpdater: { autoDownload: true, autoInstallOnAppQuit: true, on: vi.fn(), checkForUpdates: vi.fn(async () => {}) },
}));

vi.mock('../../electron/services/persistence.service', () => ({
  persistenceService: {
    getSettings: vi.fn(() => ({ runInBackground: false, syncInterval: 60, openAtLogin: false })),
    saveCredentials: vi.fn(),
    clearCredentials: vi.fn(),
    applySetting: vi.fn(),
  },
}));
vi.mock('../../electron/services/background-sync.service', () => ({
  BackgroundSyncService: vi.fn(function () { return { start: vi.fn(), restart: vi.fn(), syncNow: vi.fn(async () => {}) }; }),
}));
vi.mock('../../electron/services/cache.service', () => ({
  cacheService: { cache: {}, saveCache: vi.fn() },
}));

import '../../electron/main';

function getTraySair() {
  const template = harness.buildFromTemplate.mock.calls[0]?.[0] as Array<{ label?: string; click?: () => void }> | undefined;
  return template?.find((item) => item.label === 'Sair');
}

describe('BUG-018: "Sair" do tray roda o mesmo desligamento do close da janela', () => {
  beforeEach(() => {
    sigaaHarness.logout.mockClear();
    loggerHarness.flush.mockClear();
    harness.quit.mockClear();
  });

  it('logout e flush rodam antes do app.quit seguir, e o quit reentrante não repete o desligamento', async () => {
    vi.useFakeTimers();
    try {
      const sair = getTraySair();
      expect(typeof sair?.click).toBe('function');

      sair!.click!();
      await vi.advanceTimersByTimeAsync(0);

      expect(sigaaHarness.logout).toHaveBeenCalledTimes(1);
      expect(loggerHarness.flush).toHaveBeenCalledTimes(1);
      expect(harness.quit).toHaveBeenCalledTimes(2);
      expect(sigaaHarness.logout.mock.invocationCallOrder[0])
        .toBeLessThan(loggerHarness.flush.mock.invocationCallOrder[0]);
      expect(loggerHarness.flush.mock.invocationCallOrder[0])
        .toBeLessThan(harness.quit.mock.invocationCallOrder[1]);
    } finally {
      vi.useRealTimers();
    }
  });
});
