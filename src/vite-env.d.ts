/// <reference types="vite/client" />
declare const __APP_VERSION__: string;

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
        getNewsDetail: (courseId: string, courseName: string, newsId: string) => Promise<any>;
        loadAllNews: (courseId: string, courseName: string) => Promise<any>;
        logout: () => Promise<any>;
        clearAllData: () => Promise<any>;
        getSettings: () => Promise<any>;
        updateSetting: (key: string, value: any) => Promise<any>;
    };
    ipcRenderer: any;
}
