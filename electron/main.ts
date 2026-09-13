import { app, BrowserWindow, dialog, session, shell, Tray, Menu } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { SigaaService } from './services/sigaa.service'
import { autoUpdater } from 'electron-updater'
import { execSync } from 'child_process'
import { persistenceService } from './services/persistence.service'
import { BackgroundSyncService } from './services/background-sync.service'
import { cacheService } from './services/cache.service'
import { logger } from './services/logger.service'
import { getActiveAccount } from './services/account-context.service'
import { diagnosticsService } from './services/diagnostics.service'
import { PortalCompatibilityService } from './services/portal-compatibility.service'
import { registerIpcHandlers } from './ipc/register-handlers'
import { installNavigationGuard } from './security/navigation-policy'
import { errorMessage } from '../shared/errors'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Isolate Dev environment from Production database to prevent lock collisions
// But respect custom user-data-dir passed by Playwright E2E tests!
if (!app.isPackaged) {
  const hasCustomUserData = process.argv.some(arg => arg.startsWith('--user-data-dir='));
  if (!hasCustomUserData) {
    app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-dev`));
  }
}

const log = logger.scope('main');
const updaterLog = logger.scope('Updater');

log.info('=== SIGAA-ME App Started ===');

/**
 * Legado deixado por versões antigas: `sigaa-me.log`/`scraper.log` (loggers
 * substituídos em OBS-001/OBS-004), `debug_*.html|json` na raiz do `userData`
 * (dumps que OBS-003 move para `diagnostics/`) e `logs/app_*.log` (rotação
 * antiga). Idempotente e nunca lança: quem já rodou uma vez, ou quem nunca
 * teve nada disso, não sente diferença. Não bloqueia o boot além do
 * `readdir` — cada exclusão é disparada, não aguardada em série pelo chamador.
 */
export async function removeLegacyLogs(userDataPath: string): Promise<void> {
  const targets = [
    path.join(userDataPath, 'sigaa-me.log'),
    path.join(userDataPath, 'scraper.log'),
  ];

  try {
    for (const entry of fs.readdirSync(userDataPath)) {
      if (/^debug_.*\.(html|json)$/.test(entry)) targets.push(path.join(userDataPath, entry));
    }
  } catch {
    // userData ainda não existe (primeiro boot): nada a limpar.
  }

  const logsDir = path.join(userDataPath, 'logs');
  try {
    for (const entry of fs.readdirSync(logsDir)) {
      if (/^app_.*\.log$/.test(entry)) targets.push(path.join(logsDir, entry));
    }
  } catch {
    // logs/ ainda não existe (LoggerService só a cria no primeiro write).
  }

  for (const file of targets) {
    try {
      await fs.promises.unlink(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') continue; // já apagado numa chamada anterior
      log.error('Falha ao apagar log legado', { file, error: errorMessage(error) });
    }
  }
}

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null = null
const sigaaService = new SigaaService()
// Ponto único de notificação (decisão 5, PORTAL-005): flip por sync em
// background e restauração manual (get-course-files) passam pelo mesmo
// onChange, porque é a mesma instância nos dois construtores abaixo.
const portalCompatibilityService = new PortalCompatibilityService(
  path.join(app.getPath('userData'), 'compatibility.json'),
  status => { if (win && !win.isDestroyed()) win.webContents.send('compatibility-changed', status) },
)
const backgroundSyncService = new BackgroundSyncService(sigaaService, () => win, portalCompatibilityService)

async function simulateNewFile(): Promise<boolean> {
  const accountId = getActiveAccount();
  if (!accountId) {
    log.info('[Dev] Nenhuma conta ativa para simular.');
    return false;
  }
  const forgotten = cacheService.forgetLastFile(accountId);
  if (!forgotten) {
    log.info('[Dev] Nenhum arquivo em cache para simular.');
    return false;
  }
  log.info(`[Dev] Esquecido ${forgotten.fileId} de ${forgotten.courseId}. Sincronizando...`);
  await backgroundSyncService.syncNow();
  return true;
}

registerIpcHandlers({
  sigaaService,
  persistence: persistenceService,
  backgroundSync: backgroundSyncService,
  cache: cacheService,
  logger,
  diagnostics: diagnosticsService,
  compatibility: portalCompatibilityService,
  userDataPath: app.getPath('userData'),
  clearBrowserStorage: () => session.defaultSession.clearStorageData(),
  getWindow: () => win,
  allowedOrigin: VITE_DEV_SERVER_URL ? new URL(VITE_DEV_SERVER_URL).origin : 'file:',
  isPackaged: app.isPackaged,
  simulateNewFile,
});

function createWindow() {
  const isHiddenStartup = process.argv.includes('--hidden');

  // Autoridade do bridge de dev (DEV-001): sinal por env, não por argv, porque
  // um preload empacotado recebe o mesmo argv que o main dev injetou. Precisa
  // ser definido antes de `new BrowserWindow(...)` — o renderer herda o
  // ambiente do main só no spawn da janela — e apagado quando empacotado,
  // porque um valor deixado por um boot dev anterior vazaria para este.
  if (!app.isPackaged) {
    process.env.SIGAA_DEV_BRIDGE = '1';
  } else {
    delete process.env.SIGAA_DEV_BRIDGE;
  }

  const window = new BrowserWindow({
    show: !isHiddenStartup,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      additionalArguments: app.isPackaged ? [] : ['--sigaa-dev'],
      // Explícitos por documentação (SEC-003): já são o efetivo no Electron 30,
      // mas ninguém deveria precisar saber disso para auditar a janela.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })
  win = window

  installNavigationGuard(window.webContents, {
    appUrl: VITE_DEV_SERVER_URL ?? pathToFileURL(path.join(RENDERER_DIST, 'index.html')).href,
    // Ligação tardia de propósito: o E2E troca `shell.openExternal` por um stub.
    openExternal: (url) => shell.openExternal(url),
    confirmExternal: async (url) => {
      const { response } = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['Abrir no navegador', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'Abrir link externo',
        message: 'Abrir este link fora do SIGAA-ME?',
        detail: url,
      })
      return response === 0
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  win.on('close', (e) => {
    const settings = persistenceService.getSettings();
    if (settings.runInBackground && !isQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });
}

let isQuitting = false;

app.on('before-quit', async (e) => {
  if (!isQuitting) {
    e.preventDefault();
    log.info('App is closing. Cleaning up background processes...');
    isQuitting = true;
    try {
      // A wedged Chrome can make browser.close() hang forever; quitting must
      // not depend on it. 5s is generous for a healthy teardown.
      await Promise.race([
        sigaaService.logout(),
        new Promise<void>((resolve) => setTimeout(() => {
          log.warn('Cleanup timed out after 5s; quitting anyway.');
          resolve();
        }, 5000))
      ]);
    } catch (err) {
      log.error('Cleanup error', { err });
    }
    // O logger é do app, não da conta: nada de conteúdo a perder aqui, então
    // um `flush` que nunca rejeita não bloqueia o quit de verdade.
    await logger.flush();
    app.quit();
  }
});

app.on('window-all-closed', () => {
  const settings = persistenceService.getSettings();
  if (!settings.runInBackground && process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  void removeLegacyLogs(app.getPath('userData'));

  try {
    // Chrome ausente não é erro: é o caso que estamos detectando. Por isso os
    // catch abaixo não engolem falha — a ausência É a informação, e ela vira o
    // dialog logo adiante. (Regra 3 do CLAUDE.md se aplica a erro ignorado,
    // não a sondagem cujo fracasso é resultado válido.)
    const commandSucceeds = (command: string): boolean => {
      try {
        execSync(command, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    };

    let chromeExists: boolean;
    if (process.platform === 'win32') {
      const appPaths = 'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe';
      chromeExists =
        commandSucceeds(`reg query "HKEY_LOCAL_MACHINE\\${appPaths}"`) ||
        commandSucceeds(`reg query "HKEY_CURRENT_USER\\${appPaths}"`);
    } else if (process.platform === 'darwin') {
      chromeExists = fs.existsSync('/Applications/Google Chrome.app');
    } else {
      chromeExists = commandSucceeds('which google-chrome');
    }

    if (!chromeExists) {
      dialog.showErrorBox(
        'Google Chrome Requerido',
        'O SIGAA-ME precisa do Google Chrome instalado para funcionar. Por favor, instale o Chrome e tente novamente.'
      );
    }
  } catch (e) {
    log.error('Failed to check for Chrome', { err: e });
  }

  createWindow();
  
  // Tray Setup
  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir SIGAA-ME', click: () => win?.show() },
    { label: 'Sincronizar Agora', click: () => backgroundSyncService.syncNow() },
    ...(app.isPackaged ? [] : [{ type: 'separator' } as const, { label: '[Dev] Simular Arquivo Novo', click: () => { void simulateNewFile(); } } as const]),
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('SIGAA-ME Background Sync');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    win?.show();
  });
  
  backgroundSyncService.start();
  
  setupAutoUpdater();
})

export function setupAutoUpdater(): void {
  // Unsigned binaries + automatic install = anyone with write access to the
  // GitHub Releases page ships code to every install. Consent first.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Update Management
  autoUpdater.on('update-available', (info) => {
    updaterLog.info('Update available', { version: info.version });
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualização Disponível',
      message: `Uma nova versão do SIGAA-ME está disponível (${info.version}). Deseja baixá-la agora?`,
      detail: 'O download vem do GitHub Releases do projeto. Nada será instalado sem a sua confirmação.',
      buttons: ['Baixar', 'Agora não'],
      cancelId: 1
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate().catch(err => {
          updaterLog.error('Download failed', { err });
        });
      }
    }).catch(err => updaterLog.error('Dialog failed', { err }));
  });
  autoUpdater.on('update-not-available', () => {
    updaterLog.info('App is up to date.');
  });
  autoUpdater.on('error', (err) => {
    updaterLog.error('Update error', { err });
  });
  autoUpdater.on('update-downloaded', () => {
    updaterLog.info('Update downloaded. Preparing to install...');
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualização Disponível',
      message: 'Uma nova versão do SIGAA-ME foi baixada. O aplicativo será reiniciado para instalar a atualização.',
      buttons: ['Reiniciar e Instalar', 'Mais Tarde']
    }).then(result => {
      if (result.response === 0) {
        // Force the app to quit and install using our graceful before-quit logic
        autoUpdater.quitAndInstall();
      }
    }).catch(err => updaterLog.error('Dialog failed', { err }));
  });

  autoUpdater.checkForUpdates().catch(err => {
    updaterLog.error('Failed to check for updates', { err });
  });
}
