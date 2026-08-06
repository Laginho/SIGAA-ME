import { ipcRenderer, contextBridge, type IpcRendererEvent } from 'electron'
import type {
  BackgroundSyncUpdate,
  DownloadAllFilesPayload,
  DownloadFilePayload,
  DownloadProgress,
  LoginCredentials,
  RendererApi,
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

/**
 * A anotação `: RendererApi` é a verificação que faltava nesta fronteira.
 *
 * O tipo vem de `shared/ipc.ts` e é o mesmo que `src/vite-env.d.ts` usa para
 * declarar `window.api`. Ponte que falta virou erro de compilação: foi assim que
 * `getSettings` conseguiu ficar declarada, atendida pelo main, e sem ponte aqui
 * (`BUG-008`). Não troque por `satisfies` nem tire a anotação — é ela que
 * amarra as duas pontas.
 *
 * O que isto **não** cobre: se o canal invocado abaixo não tiver
 * `ipcMain.handle` do outro lado, o `tsc` não vê. Essa metade é verificada por
 * `tests/unit/preload-contract.test.ts`, que lê o `main.ts`.
 */
const api: RendererApi = {
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
  getSettings: () => ipcRenderer.invoke('get-app-settings'),
  // A união discriminada amarra cada chave ao tipo do seu valor (SEC-002); a
  // assinatura genérica vem do `RendererApi` por tipagem contextual. Repeti-la
  // aqui não compila: duas assinaturas genéricas com `Extract<...>` diferido não
  // se provam equivalentes.
  updateSetting: (key, value) => ipcRenderer.invoke('update-app-setting', { key, value }),

  // Dev Testing
  simulateNewFile: () => ipcRenderer.invoke('test-simulate-new-file'),

  // Background Sync Updates
  onBackgroundSyncUpdate: (callback: (data: BackgroundSyncUpdate) => void) => {
    const subscription = (_event: IpcRendererEvent, data: BackgroundSyncUpdate) => callback(data)
    ipcRenderer.on('background-sync-update', subscription)
    return () => ipcRenderer.off('background-sync-update', subscription)
  }
}

contextBridge.exposeInMainWorld('api', api)
