/// <reference types="vite/client" />

interface Window {
    api: {
        login: (credentials: { username: string; password: string }) => Promise<any>;
        getCourses: () => Promise<any>;
        getCourseFiles: (courseId: string) => Promise<any>;
        selectDownloadFolder: () => Promise<any>;
        downloadFile: (data: any) => Promise<any>;
        downloadAllFiles: (data: any) => Promise<any>;
    };
    ipcRenderer: any;
}
