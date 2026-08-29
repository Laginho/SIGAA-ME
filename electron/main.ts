import { app, BrowserWindow, ipcMain, dialog, Tray, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { SigaaService } from './services/sigaa.service'
import { autoUpdater } from 'electron-updater'
import { execSync } from 'child_process'
import { persistenceService } from './services/persistence.service'
import { BackgroundSyncService } from './services/background-sync.service'
import { cacheService } from './services/cache.service'
import type {
  DownloadAllFilesPayload,
  DownloadFilePayload,
  DownloadProgress,
  DownloadStatus,
  LoginCredentials,
  SettingUpdate,
} from '../shared/ipc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Isolate Dev environment from Production database to prevent lock collisions
// But respect custom user-data-dir passed by Playwright E2E tests!
if (!app.isPackaged) {
  const hasCustomUserData = process.argv.some(arg => arg.startsWith('--user-data-dir='));
  if (!hasCustomUserData) {
    app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-dev`));
  }
}

// ===== FILE LOGGER SETUP =====
const logsDir = path.join(app.getPath('userData'), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFileName = `app_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
const logFilePath = path.join(logsDir, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const formatLog = (level: string, args: unknown[]) => {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  return `[${timestamp}] [${level}] ${message}\n`;
};

console.log = (...args: unknown[]) => {
  originalConsoleLog.apply(console, args);
  logStream.write(formatLog('INFO', args));
};

console.error = (...args: unknown[]) => {
  originalConsoleError.apply(console, args);
  logStream.write(formatLog('ERROR', args));
};

console.warn = (...args: unknown[]) => {
  originalConsoleWarn.apply(console, args);
  logStream.write(formatLog('WARN', args));
};

console.log('=== SIGAA-ME App Started ===');
console.log(`Log file: ${logFilePath}`);
// ===== END FILE LOGGER SETUP =====

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null = null
const sigaaService = new SigaaService()
const backgroundSyncService = new BackgroundSyncService(sigaaService, () => win)

function createWindow() {
  const isHiddenStartup = process.argv.includes('--hidden');
  
  win = new BrowserWindow({
    show: !isHiddenStartup,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
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

// IPC Handlers
ipcMain.handle('login-request', async (_event, { username, password, rememberMe }: LoginCredentials) => {
  const result = await sigaaService.login(username, password)
  if (result.success && rememberMe) {
    try {
      persistenceService.saveCredentials(username, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to save remembered credentials:', message);
      return { success: false, message: `Login succeeded, but the session could not be remembered: ${message}` };
    }
  } else if (result.success && !rememberMe) {
    persistenceService.clearCredentials();
  }
  return result;
})

ipcMain.handle('try-auto-login', async () => {
  const creds = persistenceService.loadCredentials();
  if (creds) {
    console.log('Auto-login: stored credentials found');
    return await sigaaService.login(creds.username, creds.password);
  }
  return { success: false };
})

ipcMain.handle('get-courses', async () => {
  return await sigaaService.getCourses()
})

ipcMain.handle('get-course-files', async (_, { courseId, courseName }) => {
  return await sigaaService.getCourseFiles(courseId, courseName);
})

ipcMain.handle('select-download-folder', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Selecione a pasta para downloads'
  });

  if (result.canceled) {
    return { success: false };
  }

  return { success: true, folderPath: result.filePaths[0] };
})

ipcMain.handle('download-file', async (_, data: DownloadFilePayload) => {
  return await sigaaService.downloadFile(
    data.courseId,
    data.courseName,
    data.fileName,
    data.fileUrl,
    data.basePath,
    data.downloadedFiles,
    data.script
  );
})

ipcMain.handle('download-all-files', async (_, data: DownloadAllFilesPayload) => {
  const onProgress = (fileName: string, status: DownloadStatus) => {
    const progress: DownloadProgress = { fileName, status };
    win?.webContents.send('download-progress', progress);
  };

  return await sigaaService.downloadAllFiles(
    data.courseId,
    data.courseName,
    data.files,
    data.basePath,
    data.downloadedFiles,
    onProgress
  );
})

ipcMain.handle('check-files-existence', async (_, filePaths: string[]) => {
  return filePaths.map(filePath => ({
    path: filePath,
    exists: fs.existsSync(filePath)
  }));
})

ipcMain.handle('get-news-detail', async (_, { courseId, courseName, newsId }) => {
  return await sigaaService.getNewsDetail(courseId, courseName, newsId);
})

ipcMain.handle('load-all-news', async (_, courseId: string, courseName: string) => {
  return await sigaaService.loadAllNews(courseId, courseName);
});

// App Settings Handlers
ipcMain.handle('get-app-settings', async () => {
  return persistenceService.getSettings();
});

ipcMain.handle('update-app-setting', async (_, update: SettingUpdate) => {
  persistenceService.applySetting(update);
  if (update.key === 'openAtLogin') {
    app.setLoginItemSettings({
      openAtLogin: update.value,
      path: process.execPath,
      args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden']
    });
  }
  if (update.key === 'runInBackground' || update.key === 'syncInterval') {
    backgroundSyncService.restart();
  }
  return { success: true };
});

if (!app.isPackaged) {
  ipcMain.handle('test-simulate-new-file', async () => {
    const cacheData = cacheService['cache'];
    const courseIds = Object.keys(cacheData);
    if (courseIds.length > 0) {
      for (const cId of courseIds) {
        if (cacheData[cId].files && cacheData[cId].files.length > 0) {
          cacheData[cId].files.pop();
          cacheService['saveCache']();
          console.log(`[E2E Test] Simulated new file by popping cache for ${cId}. Starting syncNow...`);
          await backgroundSyncService.syncNow();
          return true;
        }
      }
    }
    return false;
  });
}

ipcMain.handle('logout', async () => {
  console.log('Logout: Clearing credentials and closing session...');
  try {
    persistenceService.clearCredentials();
    await sigaaService.logout();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Logout error:', message);
    return { success: false, message };
  }
});

ipcMain.handle('clear-all-data', async () => {
  console.log('Clear all data: Clearing credentials and closing session...');
  try {
    persistenceService.clearCredentials();
    await sigaaService.logout();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Clear all data error:', message);
    return { success: false, message };
  }
});

let isQuitting = false;

app.on('before-quit', async (e) => {
  if (!isQuitting) {
    e.preventDefault();
    console.log('App is closing. Cleaning up background processes...');
    isQuitting = true;
    try {
      // A wedged Chrome can make browser.close() hang forever; quitting must
      // not depend on it. 5s is generous for a healthy teardown.
      await Promise.race([
        sigaaService.logout(),
        new Promise<void>((resolve) => setTimeout(() => {
          console.warn('Cleanup timed out after 5s; quitting anyway.');
          resolve();
        }, 5000))
      ]);
    } catch (err) {
      console.error('Cleanup error:', err);
    }
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
    console.error('Failed to check for Chrome:', e);
  }

  createWindow();
  
  // Tray Setup
  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir SIGAA-ME', click: () => win?.show() },
    { label: 'Sincronizar Agora', click: () => backgroundSyncService.syncNow() },
    { type: 'separator' },
    { label: '[Dev] Simular Arquivo Novo', click: () => {
        const cacheData = cacheService['cache'];
        const courseIds = Object.keys(cacheData);
        if (courseIds.length > 0) {
            for (const cId of courseIds) {
                if (cacheData[cId].files && cacheData[cId].files.length > 0) {
                    const removed = cacheData[cId].files.pop();
                    cacheService['saveCache']();
                    console.log(`[Dev] Removido do cache o arquivo ${removed}. Iniciando Sync...`);
                    backgroundSyncService.syncNow();
                    return;
                }
            }
            console.log('[Dev] Nenhum arquivo salvo no cache para simular.');
        } else {
            console.log('[Dev] Cache vazio. Clique em Sincronizar Agora primeiro.');
        }
    }},
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('SIGAA-ME Background Sync');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    win?.show();
  });
  
  backgroundSyncService.start();
  
  // Update Management
  autoUpdater.on('update-available', () => {
    console.log('[Updater] Update available!');
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] App is up to date.');
  });
  autoUpdater.on('error', (err) => {
    console.error('[Updater] Update error:', err);
  });
  autoUpdater.on('update-downloaded', () => {
    console.log('[Updater] Update downloaded. Preparing to install...');
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
    });
  });

  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error('Failed to check for updates:', err);
  });
})
