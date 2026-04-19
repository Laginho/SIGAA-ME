import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { SigaaService } from './services/sigaa.service'
import { autoUpdater } from 'electron-updater'
import { execSync } from 'child_process'
import { persistenceService } from './services/persistence.service'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

const formatLog = (level: string, args: any[]) => {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  return `[${timestamp}] [${level}] ${message}\n`;
};

console.log = (...args: any[]) => {
  originalConsoleLog.apply(console, args);
  logStream.write(formatLog('INFO', args));
};

console.error = (...args: any[]) => {
  originalConsoleError.apply(console, args);
  logStream.write(formatLog('ERROR', args));
};

console.warn = (...args: any[]) => {
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
const sigaaService = new SigaaService()

function createWindow() {
  win = new BrowserWindow({
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
}

const CREDENTIALS_PATH = path.join(app.getPath('userData'), 'credentials.json');

function saveCredentials(username: string, password: string) {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(password);
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify({
      username,
      password: encrypted.toString('base64')
    }));
  }
}

function loadCredentials() {
  if (fs.existsSync(CREDENTIALS_PATH) && safeStorage.isEncryptionAvailable()) {
    try {
      const data = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
      const password = safeStorage.decryptString(Buffer.from(data.password, 'base64'));
      return { username: data.username, password };
    } catch (e) {
      console.error('Failed to load credentials', e);
    }
  }
  return null;
}

// IPC Handlers
ipcMain.handle('login-request', async (_event, { username, password, rememberMe }) => {
  const result = await sigaaService.login(username, password)
  if (result.success && rememberMe) {
    saveCredentials(username, password);
  } else if (result.success && !rememberMe) {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
  }
  return result;
})

ipcMain.handle('try-auto-login', async () => {
  const creds = loadCredentials();
  if (creds) {
    console.log('Auto-login: Found credentials for', creds.username);
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

ipcMain.handle('download-file', async (_, data: {
  courseId: string;
  courseName: string;
  fileName: string;
  fileUrl: string;
  basePath: string;
  downloadedFiles: Record<string, any>;
  script?: string;
}) => {
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

ipcMain.handle('download-all-files', async (_, data: {
  courseId: string;
  courseName: string;
  files: Array<{ name: string; url: string; script?: string }>;
  basePath: string;
  downloadedFiles: Record<string, any>;
}) => {
  const onProgress = (fileName: string, status: 'downloaded' | 'skipped' | 'failed') => {
    win?.webContents.send('download-progress', { fileName, status });
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

ipcMain.handle('update-app-setting', async (_, { key, value }) => {
  persistenceService.updateSetting(key, value);
  return { success: true };
});

ipcMain.handle('logout', async () => {
  console.log('Logout: Clearing credentials and closing session...');
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
    await sigaaService.logout();
    return { success: true };
  } catch (error: any) {
    console.error('Logout error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('clear-all-data', async () => {
  console.log('Clear all data: Clearing credentials and closing session...');
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      fs.unlinkSync(CREDENTIALS_PATH);
    }
    await sigaaService.logout();
    return { success: true };
  } catch (error: any) {
    console.error('Clear all data error:', error);
    return { success: false, message: error.message };
  }
});

let isQuitting = false;

app.on('before-quit', async (e) => {
  if (!isQuitting) {
    e.preventDefault();
    console.log('App is closing. Cleaning up background processes...');
    isQuitting = true;
    try {
      await sigaaService.logout();
    } catch (err) {
      console.error('Cleanup error:', err);
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
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
    let chromeExists = false;
    if (process.platform === 'win32') {
      try {
        execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"');
        chromeExists = true;
      } catch (e) {
        try {
          execSync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe"');
          chromeExists = true;
        } catch (e2) {}
      }
    } else if (process.platform === 'darwin') {
      chromeExists = fs.existsSync('/Applications/Google Chrome.app');
    } else {
      try {
        execSync('which google-chrome');
        chromeExists = true;
      } catch (e) {}
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
