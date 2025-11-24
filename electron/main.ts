import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { SigaaService } from './services/sigaa.service'


const __dirname = path.dirname(fileURLToPath(import.meta.url))


// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
const sigaaService = new SigaaService()

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
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

ipcMain.handle('get-course-files', async (_, courseId: string) => {
  return await sigaaService.getCourseFiles(courseId);
})

// Download folder selection
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

// Download single file
ipcMain.handle('download-file', async (_, data: {
  courseId: string;
  courseName: string;
  fileName: string;
  fileUrl: string;
  basePath: string;
  downloadedFiles: Record<string, any>;
}) => {
  return await sigaaService.downloadFile(
    data.courseId,
    data.courseName,
    data.fileName,
    data.fileUrl,
    data.basePath,
    data.downloadedFiles
  );
})

// Download all files for a course
ipcMain.handle('download-all-files', async (_, data: {
  courseId: string;
  courseName: string;
  files: Array<{ name: string; url: string }>;
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

// Check if files exist
ipcMain.handle('check-files-existence', async (_, filePaths: string[]) => {
  return filePaths.map(filePath => ({
    path: filePath,
    exists: fs.existsSync(filePath)
  }));
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
