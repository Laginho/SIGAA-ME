/// <reference types="vite/client" />

interface Window {
    ipcRenderer: import('electron').IpcRenderer
    api: {
        login: (credentials: any) => Promise<any>;
        getCourses: () => Promise<any>;
        getCourseFiles: (courseId: string) => Promise<any>;
    }
}
