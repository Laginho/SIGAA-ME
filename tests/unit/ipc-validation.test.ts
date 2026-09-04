/**
 * SEC-002: a fronteira IPC passa a validar e confiar no remetente.
 *
 * Este arquivo é vermelho hoje: os módulos `electron/ipc/validation.ts`,
 * `electron/ipc/sender-policy.ts` e `electron/ipc/register-handlers.ts` não
 * existem — a falha de import é o vermelho legítimo, não erro de digitação.
 *
 * Parte 1: validadores puros. Cópia por allowlist (campos extras do cache
 * antigo, como `script`, não atravessam), ids do SIGAA com formato apertado
 * (o `newsId` entra em seletor por interpolação), `SettingUpdate` restrita às
 * chaves do renderer. `isTrustedSender` não vê `webContents` de verdade:
 * recebe os primitivos.
 *
 * Parte 2: handlers registrados via `registerIpcHandlers`, com `electron`
 * mockado no padrão de `updater-consent.test.ts` (`vi.hoisted` + `vi.mock`):
 * o `ipcMain.handle` mockado guarda (canal → handler) num `Map`. A checagem
 * de remetente é do wrapper, vale para todo canal (inclusive os sem payload);
 * payload inválido → `INVALID_REQUEST` e o serviço **não** é chamado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/errors';
import {
    parseId,
    parseText,
    parseLoginCredentials,
    parseCourseRequest,
    parseDownloadFilePayload,
    parseDownloadAllFilesPayload,
    parseNewsDetailRequest,
    parseFilePaths,
    parseSettingUpdate,
} from '../../electron/ipc/validation';
import { isTrustedSender } from '../../electron/ipc/sender-policy';
import { registerIpcHandlers } from '../../electron/ipc/register-handlers';

const electronMock = vi.hoisted(() => {
    const handlers = new Map<string, (event: any, payload: any) => any>();
    const ipcMain: any = {
        handle: vi.fn((channel: string, fn: any) => { handlers.set(channel, fn); }),
    };
    const app: any = {
        isPackaged: true,
        setLoginItemSettings: vi.fn(),
        getAppPath: vi.fn(() => '/app/app'),
    };
    const dialog: any = {
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    };
    return { handlers, ipcMain, app, dialog };
});

vi.mock('electron', () => ({
    ipcMain: electronMock.ipcMain,
    app: electronMock.app,
    dialog: electronMock.dialog,
}));

// ── 1. Validadores puros ─────────────────────────────────────
describe('validadores puros do IPC', () => {
    describe('parseId (ids do SIGAA: idTurma, arquivo, notícia)', () => {
        it('aceita ids do SIGAA', () => {
            expect(parseId('540316')).toBe('540316');
            expect(parseId('j_id_1287906063_25')).toBe('j_id_1287906063_25');
        });

        it('rejeita vazio, aspas/colchete (quebra de seletor), espaço, comprimento, número e null', () => {
            expect(parseId('')).toBeNull();
            expect(parseId('a"]')).toBeNull();
            expect(parseId('1 2')).toBeNull();
            expect(parseId('a'.repeat(65))).toBeNull();
            expect(parseId(42)).toBeNull();
            expect(parseId(null)).toBeNull();
        });
    });

    describe('parseText (texto de exibição / nome de arquivo)', () => {
        it('aceita texto curto', () => {
            expect(parseText('Cálculo', 255)).toBe('Cálculo');
        });

        it('rejeita vazio, NUL, excesso de comprimento e não-string', () => {
            expect(parseText('', 255)).toBeNull();
            expect(parseText('a\0b', 255)).toBeNull();
            expect(parseText('a'.repeat(256), 255)).toBeNull();
            expect(parseText(123, 255)).toBeNull();
        });
    });

    describe('parseLoginCredentials', () => {
        it('aceita credenciais completas, com rememberMe opcional', () => {
            expect(parseLoginCredentials({ username: 'aluno', password: 'x' })).toEqual({ username: 'aluno', password: 'x' });
            expect(parseLoginCredentials({ username: 'aluno', password: 'x', rememberMe: true })).toEqual({ username: 'aluno', password: 'x', rememberMe: true });
        });

        it('rejeita sem senha e com username além do limite', () => {
            expect(parseLoginCredentials({ username: 'x' })).toBeNull();
            expect(parseLoginCredentials({ username: 'a'.repeat(101), password: 'x' })).toBeNull();
        });
    });

    describe('parseCourseRequest', () => {
        it('aceita courseId e courseName válidos', () => {
            expect(parseCourseRequest({ courseId: '540316', courseName: 'Cálculo' })).toEqual({ courseId: '540316', courseName: 'Cálculo' });
        });

        it('rejeita courseId inválido', () => {
            expect(parseCourseRequest({ courseId: '1"]', courseName: 'Cálculo' })).toBeNull();
        });
    });

    describe('parseDownloadFilePayload', () => {
        it('devolve cópia por allowlist, sem os campos extras do cache', () => {
            const result = parseDownloadFilePayload({
                courseId: '540316',
                courseName: 'Cálculo',
                fileId: '555',
                fileName: 'a.pdf',
                script: 'jsfcljs(...)',
                basePath: 'C:\\',
            });
            expect(result).toEqual({ courseId: '540316', courseName: 'Cálculo', fileId: '555', fileName: 'a.pdf' });
        });

        it('rejeita fileId vazio', () => {
            expect(parseDownloadFilePayload({ courseId: '540316', courseName: 'Cálculo', fileId: '', fileName: 'a.pdf' })).toBeNull();
        });
    });

    describe('parseDownloadAllFilesPayload', () => {
        const base = { courseId: '540316', courseName: 'Cálculo' };

        it('rejeita listas acima de 500 arquivos', () => {
            const files = Array.from({ length: 501 }, (_, i) => ({ id: String(i), name: `f${i}.pdf` }));
            expect(parseDownloadAllFilesPayload({ ...base, files })).toBeNull();
        });

        it('rejeita item sem name', () => {
            expect(parseDownloadAllFilesPayload({ ...base, files: [{ id: '1' }] })).toBeNull();
        });

        it('copia cada item sem o campo extra', () => {
            const result = parseDownloadAllFilesPayload({ ...base, files: [{ id: '1', name: 'a', script: 'jsfcljs(...)' }] });
            expect(result).toEqual({ ...base, files: [{ id: '1', name: 'a' }] });
        });
    });

    describe('parseNewsDetailRequest', () => {
        it('aceita newsId válido', () => {
            expect(parseNewsDetailRequest({ courseId: '540316', courseName: 'Cálculo', newsId: 'n1' })).toEqual({ courseId: '540316', courseName: 'Cálculo', newsId: 'n1' });
        });

        it('rejeita newsId com injeção no seletor do getNewsDetail', () => {
            expect(parseNewsDetailRequest({ courseId: '540316', courseName: 'Cálculo', newsId: '1"])' })).toBeNull();
        });
    });

    describe('parseFilePaths', () => {
        it('aceita array de caminhos', () => {
            expect(parseFilePaths(['C:\\a', 'C:\\b'])).toEqual(['C:\\a', 'C:\\b']);
        });

        it('aceita array vazio', () => {
            expect(parseFilePaths([])).toEqual([]);
        });

        it('rejeita não-array e elemento não-string', () => {
            expect(parseFilePaths('C:\\x')).toBeNull();
            expect(parseFilePaths([1])).toBeNull();
        });
    });

    describe('parseSettingUpdate', () => {
        it('aceita as chaves permitidas com valores válidos', () => {
            expect(parseSettingUpdate({ key: 'theme', value: 'dark' })).toEqual({ key: 'theme', value: 'dark' });
            expect(parseSettingUpdate({ key: 'syncInterval', value: 60 })).toEqual({ key: 'syncInterval', value: 60 });
            expect(parseSettingUpdate({ key: 'lastDownloadPath', value: null })).toEqual({ key: 'lastDownloadPath', value: null });
            expect(parseSettingUpdate({ key: 'openAtLogin', value: true })).toEqual({ key: 'openAtLogin', value: true });
        });

        it('rejeita theme fora da allowlist e update sem value', () => {
            expect(parseSettingUpdate({ key: 'theme', value: 'blue' })).toBeNull();
            expect(parseSettingUpdate({ key: 'theme' })).toBeNull();
        });

        it('rejeita syncInterval não inteiro, abaixo de 15 ou acima de 1440', () => {
            expect(parseSettingUpdate({ key: 'syncInterval', value: '60' })).toBeNull();
            expect(parseSettingUpdate({ key: 'syncInterval', value: 5 })).toBeNull();
            expect(parseSettingUpdate({ key: 'syncInterval', value: 60.5 })).toBeNull();
        });

        it('lastDownloadPath só aceita null (definir é do main)', () => {
            expect(parseSettingUpdate({ key: 'lastDownloadPath', value: 'C:\\x' })).toBeNull();
        });

        it('rejeita as chaves que o renderer não pode alterar', () => {
            expect(parseSettingUpdate({ key: 'lastBackgroundSync', value: 1 })).toBeNull();
            expect(parseSettingUpdate({ key: 'autoSync', value: true })).toBeNull();
        });
    });

    describe('isTrustedSender', () => {
        const policy = { windowWebContentsId: 7, allowedOrigin: 'http://localhost:5173' };

        it('aceita o frame principal da origem que nós carregamos', () => {
            expect(isTrustedSender({ url: 'http://localhost:5173/#/dashboard', parent: null }, 7, policy)).toBe(true);
        });

        it('rejeita id de webContents diferente', () => {
            expect(isTrustedSender({ url: 'http://localhost:5173/#/dashboard', parent: null }, 9, policy)).toBe(false);
        });

        it('rejeita frame nulo', () => {
            expect(isTrustedSender(null, 7, policy)).toBe(false);
        });

        it('rejeita frame filho (iframe)', () => {
            expect(isTrustedSender({ url: 'http://localhost:5173/', parent: {} }, 7, policy)).toBe(false);
        });

        it('rejeita origem externa', () => {
            expect(isTrustedSender({ url: 'https://si3.ufc.br/sigaa/', parent: null }, 7, policy)).toBe(false);
        });

        it('empacotado: file:// entra, http sai', () => {
            const packaged = { windowWebContentsId: 7, allowedOrigin: 'file:' };
            expect(isTrustedSender({ url: 'file:///C:/app/dist/index.html#/dashboard', parent: null }, 7, packaged)).toBe(true);
            expect(isTrustedSender({ url: 'http://localhost:5173/', parent: null }, 7, packaged)).toBe(false);
        });
    });
});

// ── 2. Handlers registrados ──────────────────────────────────
describe('registerIpcHandlers: remetente, validação e cópia limpa', () => {
    const trustedEvent = {
        sender: { id: 7 },
        senderFrame: { url: 'http://localhost:5173/', parent: null },
    };

    function makeDeps(overrides: Record<string, any> = {}) {
        return {
            sigaaService: {
                login: vi.fn(async () => ok({ name: 'ALUNO', username: 'aluno' })),
                getCourses: vi.fn(async () => ok({ courses: [] })),
                getCourseFiles: vi.fn(async () => ok({ files: [], news: [] })),
                downloadFile: vi.fn(async () => ok({ filePath: 'C:/root/a.pdf' })),
                downloadAllFiles: vi.fn(async () => ok({ downloaded: [], failed: [] })),
                getNewsDetail: vi.fn(async () => ok({ title: 'T', date: 'D', notification: '', content: '' })),
                loadAllNews: vi.fn(async () => ok([])),
                logout: vi.fn(async () => ok()),
            },
            persistence: {
                getSettings: vi.fn(() => ({ lastDownloadPath: 'C:\\root' })),
                applySetting: vi.fn(),
                updateSetting: vi.fn(),
                saveCredentials: vi.fn(),
                clearCredentials: vi.fn(),
                loadCredentials: vi.fn(),
            },
            backgroundSync: { restart: vi.fn() },
            getWindow: () => ({ webContents: { id: 7 } }),
            allowedOrigin: 'http://localhost:5173',
            isPackaged: false,
            simulateNewFile: vi.fn(async () => true),
            ...overrides,
        };
    }

    let deps: any;

    async function invoke(channel: string, payload: unknown = undefined, event: any = trustedEvent) {
        const handler = electronMock.handlers.get(channel);
        expect(handler).toBeDefined();
        return await handler(event, payload);
    }

    beforeEach(() => {
        electronMock.handlers.clear();
        vi.clearAllMocks();
        deps = makeDeps();
        registerIpcHandlers(deps);
    });

    it('rejeita remetente de outra webContents e não chama o serviço', async () => {
        await expect(
            invoke(
                'download-file',
                { courseId: '540316', courseName: 'Cálculo', fileId: '555', fileName: 'a.pdf' },
                { sender: { id: 9 }, senderFrame: { url: 'http://localhost:5173/', parent: null } },
            ),
        ).rejects.toThrow();
        expect(deps.sigaaService.downloadFile).not.toHaveBeenCalled();
    });

    it('rejeita origem fora do allowlist e não chama o serviço', async () => {
        await expect(
            invoke(
                'download-file',
                { courseId: '540316', courseName: 'Cálculo', fileId: '555', fileName: 'a.pdf' },
                { sender: { id: 7 }, senderFrame: { url: 'https://si3.ufc.br/', parent: null } },
            ),
        ).rejects.toThrow();
        expect(deps.sigaaService.downloadFile).not.toHaveBeenCalled();
    });

    it('canal sem payload também rejeita remetente hostil (a checagem é do wrapper)', async () => {
        await expect(
            invoke(
                'get-app-settings',
                undefined,
                { sender: { id: 9 }, senderFrame: { url: 'http://localhost:5173/', parent: null } },
            ),
        ).rejects.toThrow();
        expect(deps.persistence.getSettings).not.toHaveBeenCalled();
    });

    it('devolve INVALID_REQUEST para download-file com campos faltando e não toca o serviço', async () => {
        const result = await invoke('download-file', { courseId: '1' });
        expect(result).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(deps.sigaaService.downloadFile).not.toHaveBeenCalled();
    });

    it('rejeita newsId com injeção de seletor em get-news-detail', async () => {
        const result = await invoke('get-news-detail', { courseId: '540316', courseName: 'Cálculo', newsId: '1"])' });
        expect(result).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(deps.sigaaService.getNewsDetail).not.toHaveBeenCalled();
    });

    it('rejeita login-request sem senha e não chama o login', async () => {
        const result = await invoke('login-request', { username: 'x' });
        expect(result).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(deps.sigaaService.login).not.toHaveBeenCalled();
    });

    it('rejeita update-app-setting com lastBackgroundSync ou lastDownloadPath não nulo', async () => {
        const r1 = await invoke('update-app-setting', { key: 'lastBackgroundSync', value: 1 });
        const r2 = await invoke('update-app-setting', { key: 'lastDownloadPath', value: 'C:\\x' });
        expect(r1).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(r2).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(deps.persistence.applySetting).not.toHaveBeenCalled();
    });

    it('check-files-existence com payload não-array devolve INVALID_REQUEST', async () => {
        const result = await invoke('check-files-existence', 'C:\\x');
        expect(result).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
    });

    it('rejeita download-all-files com item sem name', async () => {
        const result = await invoke('download-all-files', { courseId: '540316', courseName: 'Cálculo', files: [{ id: '1' }] });
        expect(result).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(deps.sigaaService.downloadAllFiles).not.toHaveBeenCalled();
    });

    it('passa ao serviço a cópia limpa do download-file, sem script nem basePath', async () => {
        const result = await invoke('download-file', {
            courseId: '540316',
            courseName: 'Cálculo',
            fileId: '555',
            fileName: 'a.pdf',
            script: 'jsfcljs(...)',
            basePath: 'C:\\',
        });
        expect(result.success).toBe(true);
        expect(deps.sigaaService.downloadFile).toHaveBeenCalledWith('540316', 'Cálculo', { id: '555', name: 'a.pdf' }, 'C:\\root');
    });

    it('load-all-news leva um único objeto CourseRequest', async () => {
        const result = await invoke('load-all-news', { courseId: '540316', courseName: 'Cálculo' });
        expect(result.success).toBe(true);
        expect(deps.sigaaService.loadAllNews).toHaveBeenCalledWith('540316', 'Cálculo');
    });

    it('update-app-setting openAtLogin aplica e ajusta o login item', async () => {
        const result = await invoke('update-app-setting', { key: 'openAtLogin', value: true });
        expect(result.success).toBe(true);
        expect(deps.persistence.applySetting).toHaveBeenCalledWith({ key: 'openAtLogin', value: true });
        expect(electronMock.app.setLoginItemSettings).toHaveBeenCalled();
    });

    it('update-app-setting syncInterval aplica e reinicia o background sync', async () => {
        const result = await invoke('update-app-setting', { key: 'syncInterval', value: 30 });
        expect(result.success).toBe(true);
        expect(deps.persistence.applySetting).toHaveBeenCalledWith({ key: 'syncInterval', value: 30 });
        expect(deps.backgroundSync.restart).toHaveBeenCalled();
    });

    it('download-file sem pasta definida devolve INVALID_REQUEST, comportamento de hoje', async () => {
        deps.persistence.getSettings.mockReturnValue({ lastDownloadPath: null });
        const result = await invoke('download-file', {
            courseId: '540316',
            courseName: 'Cálculo',
            fileId: '555',
            fileName: 'a.pdf',
        });
        expect(result).toMatchObject({ success: false, error: { code: 'INVALID_REQUEST' } });
        expect(deps.sigaaService.downloadFile).not.toHaveBeenCalled();
    });

    it('test-simulate-new-file só é registrado fora de produção', () => {
        electronMock.handlers.clear();
        registerIpcHandlers(makeDeps({ isPackaged: true }));
        expect(electronMock.handlers.has('test-simulate-new-file')).toBe(false);
        expect(electronMock.handlers.size).toBe(14);

        electronMock.handlers.clear();
        registerIpcHandlers(makeDeps({ isPackaged: false }));
        expect(electronMock.handlers.has('test-simulate-new-file')).toBe(true);
        expect(electronMock.handlers.size).toBe(15);
    });

    it('cobre exatamente os canais conhecidos (novo canal aparece aqui)', () => {
        const expected = [
            'login-request',
            'try-auto-login',
            'get-courses',
            'get-course-files',
            'select-download-folder',
            'download-file',
            'download-all-files',
            'check-files-existence',
            'get-news-detail',
            'load-all-news',
            'get-app-settings',
            'update-app-setting',
            'logout',
            'clear-all-data',
            'test-simulate-new-file',
        ];
        expect(electronMock.handlers.size).toBe(15);
        for (const channel of expected) {
            expect(electronMock.handlers.has(channel)).toBe(true);
        }
    });
});