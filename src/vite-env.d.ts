/// <reference types="vite/client" />

import type {
    AccountSummary,
    AppSettings,
    BackgroundSyncUpdate,
    DownloadAllFilesPayload,
    DownloadFilePayload,
    DownloadProgress,
    DownloadResultItem,
    LoginCredentials,
    NewsDetail,
    SettingUpdate,
} from '../shared/ipc';

// `import` no topo transforma este arquivo em módulo, então `declare global` é
// obrigatório — sem ele, `interface Window` declararia um tipo local e o
// `window.api` voltaria a ser implicitamente `any` em todo o renderer.
declare global {
    const __APP_VERSION__: string;

    /**
     * Contrato público do preload.
     *
     * Os retornos ainda usam `unknown` em vários pontos: o `ARCH-001` vai
     * modelar `CourseSummary`, `CourseFile`, `NewsDetail` e um `AppResult<T>`
     * discriminado. Até então `unknown` é honesto — obriga o consumidor a
     * validar — enquanto `any` mentia dizendo que o formato era conhecido.
     *
     * Os PAYLOADS (direção renderer -> main) já estão estritos, porque é a
     * direção que importa para segurança: é por onde dado não confiável entra
     * no processo privilegiado.
     */
    interface Window {
        api: {
            login: (credentials: LoginCredentials) => Promise<{ success: boolean; message?: string; account?: AccountSummary }>;
            tryAutoLogin: () => Promise<{ success: boolean; message?: string; account?: AccountSummary }>;
            getCourses: () => Promise<{ success: boolean; courses?: unknown[]; photoUrl?: string; message?: string }>;
            getCourseFiles: (courseId: string, courseName?: string) => Promise<{ success: boolean; files?: unknown[]; news?: unknown[]; message?: string }>;
            selectDownloadFolder: () => Promise<{ success: true; folderPath: string } | { success: false }>;
            downloadFile: (data: DownloadFilePayload) => Promise<{ success: boolean; filePath?: string; message?: string }>;
            downloadAllFiles: (data: DownloadAllFilesPayload) => Promise<{ success: boolean; message?: string; downloaded?: number; skipped?: number; failed?: number; results?: DownloadResultItem[] }>;
            checkFilesExistence: (filePaths: string[]) => Promise<{ path: string; exists: boolean }[]>;
            onDownloadProgress: (callback: (data: DownloadProgress) => void) => () => void;
            getNewsDetail: (courseId: string, courseName: string, newsId: string) => Promise<{ success: boolean; news?: NewsDetail; message?: string }>;
            loadAllNews: (courseId: string, courseName: string) => Promise<{ success: boolean; news?: unknown[]; message?: string }>;
            logout: () => Promise<{ success: boolean; message?: string }>;
            clearAllData: () => Promise<{ success: boolean; message?: string }>;
            getSettings: () => Promise<AppSettings>;
            updateSetting: <K extends SettingUpdate['key']>(
                key: K,
                value: Extract<SettingUpdate, { key: K }>['value'],
            ) => Promise<{ success: boolean }>;
            simulateNewFile: () => Promise<boolean>;
            onBackgroundSyncUpdate: (callback: (data: BackgroundSyncUpdate) => void) => () => void;
        };
        /**
         * Ponte IPC genérica. Achado P0 `SEC-002` — permite ao renderer invocar
         * qualquer canal. Tipada como `unknown` de propósito: dificulta o uso
         * acidental e não desaparece silenciosamente até o SEC-002 removê-la.
         */
        ipcRenderer: unknown;
    }
}
