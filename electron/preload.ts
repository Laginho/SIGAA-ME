import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
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
  login: (credentials: any) => ipcRenderer.invoke('login-request', credentials),
  tryAutoLogin: () => ipcRenderer.invoke('try-auto-login'),
  getCourses: () => ipcRenderer.invoke('get-courses'),
  getCourseFiles: (courseId: string, courseName?: string) => ipcRenderer.invoke('get-course-files', { courseId, courseName }),
  checkFilesExistence: (filePaths: string[]) => ipcRenderer.invoke('check-files-existence', filePaths),
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  downloadFile: (data: any) => ipcRenderer.invoke('download-file', data),
  downloadAllFiles: (data: any) => ipcRenderer.invoke('download-all-files', data),
  onDownloadProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('download-progress', subscription)
    return () => ipcRenderer.off('download-progress', subscription)
  },
  getNewsDetail: (courseId: string, courseName: string, newsId: string) => ipcRenderer.invoke('get-news-detail', { courseId, courseName, newsId }),
  getLiveSyncEnabled: () => ipcRenderer.invoke('get-live-sync-enabled'),
  setLiveSyncEnabled: (enabled: boolean) => ipcRenderer.invoke('set-live-sync-enabled', enabled),
  onSyncUpdate: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('on-sync-update', subscription)
    return () => ipcRenderer.off('on-sync-update', subscription)
  },
  onSyncScanning: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('on-sync-scanning', subscription)
    return () => ipcRenderer.off('on-sync-scanning', subscription)
  }
})
