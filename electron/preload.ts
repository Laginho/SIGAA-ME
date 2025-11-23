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
  getCourses: () => ipcRenderer.invoke('get-courses'),
  getCourseFiles: (courseId: string) => ipcRenderer.invoke('get-course-files', courseId),
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  downloadFile: (data: any) => ipcRenderer.invoke('download-file', data),
  downloadAllFiles: (data: any) => ipcRenderer.invoke('download-all-files', data),
  onDownloadProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data)
    ipcRenderer.on('download-progress', subscription)
    return () => ipcRenderer.off('download-progress', subscription)
  }
})
