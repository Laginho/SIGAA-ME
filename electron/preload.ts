import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron'
import type {
  BackgroundSyncUpdate,
  DownloadAllFilesPayload,
  DownloadFilePayload,
  DownloadProgress,
  LoginCredentials,
  SettingUpdate,
} from '../shared/ipc'

// --------- Expose some API to the Renderer process ---------
// ATENÇÃO: esta ponte genérica permite ao renderer invocar QUALQUER canal IPC.
// É o achado P0 `SEC-002` do HARDENING_TRACKER, e está aberto.
// NÃO amplie esta superfície. Todo canal novo vai em `api`, nomeado e tipado.
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('api', {
  login: (credentials: LoginCredentials) => ipcRenderer.invoke('login-request', credentials),
  tryAutoLogin: () => ipcRenderer.invoke('try-auto-login'),
  getCourses: () => ipcRenderer.invoke('get-courses'),
  getCourseFiles: (courseId: string, courseName?: string) => ipcRenderer.invoke('get-course-files', { courseId, courseName }),
  checkFilesExistence: (filePaths: string[]) => ipcRenderer.invoke('check-files-existence', filePaths),
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  downloadFile: (data: DownloadFilePayload) => ipcRenderer.invoke('download-file', data),
  downloadAllFiles: (data: DownloadAllFilesPayload) => ipcRenderer.invoke('download-all-files', data),
  onDownloadProgress: (callback: (data: DownloadProgress) => void) => {
    const subscription = (_event: IpcRendererEvent, data: DownloadProgress) => callback(data)
    ipcRenderer.on('download-progress', subscription)
    return () => ipcRenderer.off('download-progress', subscription)
  },
  getNewsDetail: (courseId: string, courseName: string, newsId: string) => ipcRenderer.invoke('get-news-detail', { courseId, courseName, newsId }),

  // News Content
  loadAllNews: (courseId: string, courseName: string) => ipcRenderer.invoke('load-all-news', courseId, courseName),

  // Session Management
  logout: () => ipcRenderer.invoke('logout'),
  clearAllData: () => ipcRenderer.invoke('clear-all-data'),

  // App Settings
  // A união discriminada amarra cada chave ao tipo do seu valor (SEC-002).
  updateSetting: <K extends SettingUpdate['key']>(
    key: K,
    value: Extract<SettingUpdate, { key: K }>['value'],
  ) => ipcRenderer.invoke('update-app-setting', { key, value }),

  // Dev Testing
  simulateNewFile: () => ipcRenderer.invoke('test-simulate-new-file'),

  // Background Sync Updates
  onBackgroundSyncUpdate: (callback: (data: BackgroundSyncUpdate) => void) => {
    const subscription = (_event: IpcRendererEvent, data: BackgroundSyncUpdate) => callback(data)
    ipcRenderer.on('background-sync-update', subscription)
    return () => ipcRenderer.off('background-sync-update', subscription)
  }
})
