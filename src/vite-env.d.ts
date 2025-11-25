/// <reference types="vite/client" />

interface Window {
    api: {
        login: (credentials: { username: string; password: string; rememberMe?: boolean }) => Promise<any>;
        tryAutoLogin: () => Promise<any>;
        getCourses: () => Promise<any>;
        getCourseFiles: (courseId: string, courseName?: string) => Promise<any>;
        selectDownloadFolder: () => Promise<any>;
        downloadFile: (data: any) => Promise<any>;
        downloadAllFiles: (data: any) => Promise<any>;
        checkFilesExistence: (filePaths: string[]) => Promise<any[]>;
        onDownloadProgress: (callback: (data: any) => void) => () => void;
        getNewsDetail: (courseId: string, newsId: string) => Promise<any>;
    };
    ipcRenderer: any;
}
