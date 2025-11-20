/// <reference types="vite/client" />

interface Window {
    ipcRenderer: import('electron').IpcRenderer
    api: {
        login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>
    }
}
