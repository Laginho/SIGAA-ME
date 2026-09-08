/**
 * Unit Tests: SigaaService
 *
 * Tests the orchestration layer (`SigaaService`) which coordinates
 * the PlaywrightLoginService and HttpScraperService.
 *
 * We mock Playwright and Axios completely, so these run instantly
 * without a real browser or network.
 *
 * Desde o `ARCH-001` este serviço é a fronteira parser -> domínio: tudo que
 * ele devolve é `AppResult<T>` (shared/errors.ts) e os modelos de
 * shared/domain.ts — sem `script`, `key`, `href` ou `onclick`. O script JSF de
 * um download é resolvido aqui, contra a página fresca, casando pelo `id` que o
 * renderer mandou. Os testes marcados (ARCH-001) falham se qualquer uma dessas
 * duas coisas regredir.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diagnosticsService } from '../../electron/services/diagnostics.service';

// QA-006: o serviço faz mkdir de verdade antes de baixar. Sem este mock o teste
// cria C:\mock\downloads no Windows (onde passa por acidente) e falha com
// EACCES em qualquer outro sistema. Nenhuma asserção aqui olha o disco.
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
}));

// 1. Mock the dependencies before importing the service
vi.mock('../../electron/services/playwright-login.service', () => {
    return {
        PlaywrightLoginService: class {
            login = vi.fn();
            close = vi.fn();
            logout = vi.fn();
            getCourses = vi.fn();
            enterCourseAndGetHTML = vi.fn();
            navigateToFilesSection = vi.fn();
            loadAllNews = vi.fn();
            downloadFile = vi.fn();
            getNewsDetail = vi.fn();
            getUserAgent = vi.fn().mockResolvedValue('mock-ua');
            getCookies = vi.fn().mockReturnValue([]);
        }
    };
});

vi.mock('../../electron/services/http-scraper.service', () => {
    return {
        HttpScraperService: class {
            setCookies = vi.fn();
            setUserAgent = vi.fn();
            resetSession = vi.fn();
            resetLog = vi.fn();
            getCourseFiles = vi.fn();
            downloadFile = vi.fn();
        }
    };
});

vi.mock('../../electron/services/logger.service', () => {
    return {
        logger: {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        }
    };
});

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn().mockReturnValue('/mock/downloads'),
        isPackaged: false,
    }
}));

import { SigaaService } from '../../electron/services/sigaa.service';
import { deriveAccountId, getActiveAccount, setActiveAccount } from '../../electron/services/account-context.service';

const SCRIPT = "jsfcljs(document.getElementById('formAva'),'formAva:j_id_jsp_1,formAva:j_id_jsp_1,id,123,key,abc','');";
const PARSED_DOC = { id: '123', name: 'doc.pdf', type: 'file', key: 'abc', script: SCRIPT };
const DOC_REF = { id: '123', name: 'doc.pdf' };

describe('SigaaService (Unit)', () => {
    let service: SigaaService;
    let mockPlaywright: any;
    let mockHttp: any;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new SigaaService();
        // Access the mocked internal instances
        mockPlaywright = (service as any).playwrightLogin;
        mockHttp = (service as any).httpScraper;
    });

    // ── Login ───────────────────────────────────────────────
    describe('login()', () => {
        it('returns the account profile and sets HTTP cookies when Playwright succeeds', async () => {
            mockPlaywright.login.mockResolvedValue({
                success: true,
                cookies: [{ name: 'TEST', value: '123' }],
                userName: 'Aluno Teste'
            });

            const result = await service.login('user', 'pass');

            expect(mockPlaywright.login).toHaveBeenCalledWith('user', 'pass');
            expect(mockHttp.setCookies).toHaveBeenCalledWith([{ name: 'TEST', value: '123' }]);
            // DATA-001: o id que atravessa o IPC é o hash do login, não a matrícula.
            expect(result).toEqual({ success: true, data: { id: deriveAccountId('user'), name: 'Aluno Teste' } });
        });

        it('returns a coded failure when Playwright fails', async () => {
            mockPlaywright.login.mockResolvedValue({
                success: false,
                error: 'SIGAA login navigation timed out. Check portal availability.'
            });

            const result = await service.login('user', 'wrongpass');

            expect(result).toEqual({
                success: false,
                error: { code: 'PORTAL_UNAVAILABLE', message: 'SIGAA login navigation timed out. Check portal availability.' }
            });
            expect(mockHttp.setCookies).not.toHaveBeenCalled();
        });
    });

    // ── getCourses ──────────────────────────────────────────
    describe('getCourses()', () => {
        it('returns CourseSummary without href/onclick (ARCH-001)', async () => {
            mockPlaywright.getCourses.mockResolvedValue({
                success: true,
                photoUrl: 'https://si3.ufc.br/foto.jpg',
                courses: [{ id: 'C1', code: 'CB0001', name: 'Math', period: '2026.1', href: '/sigaa/x.jsf', onclick: 'jsfcljs(...)' }]
            });

            const result = await service.getCourses();

            expect(mockPlaywright.getCourses).toHaveBeenCalled();
            expect(result).toEqual({
                success: true,
                data: {
                    photoUrl: 'https://si3.ufc.br/foto.jpg',
                    courses: [{ id: 'C1', code: 'CB0001', name: 'Math', period: '2026.1' }]
                }
            });
        });

        it('classifies selector drift so consumers can tell it from a session problem', async () => {
            mockPlaywright.getCourses.mockResolvedValue({
                success: false,
                error: 'SIGAA portal selector drift: the course list is missing input[name="idTurma"].'
            });

            const result = await service.getCourses();

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('SELECTOR_DRIFT');
        });
    });

    // ── getCourseFiles ──────────────────────────────────────
    describe('getCourseFiles()', () => {
        it('returns files and news stripped of script/key when both entry and scrape succeed (ARCH-001)', async () => {
            // 1. Playwright enters the course
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({
                success: true,
                html: '<html>...</html>'
            });

            // 2. HTTP Scraper parses the HTML
            mockHttp.getCourseFiles.mockResolvedValue({
                success: true,
                files: [{ ...PARSED_DOC, date: '01/02/2026' }],
                news: [{ id: 'N1', title: 'Aviso', date: '01/01/2026', notification: 'Sim', script: SCRIPT }]
            });

            const result = await service.getCourseFiles('C1', 'Math');

            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalledWith('C1', 'Math');
            expect(mockHttp.getCourseFiles).toHaveBeenCalledWith('C1', 'Math', '<html>...</html>');
            expect(result).toEqual({
                success: true,
                data: {
                    files: [{ id: '123', name: 'doc.pdf', type: 'file', date: '01/02/2026' }],
                    news: [{ id: 'N1', title: 'Aviso', date: '01/01/2026', notification: 'Sim' }]
                }
            });
            expect(JSON.stringify(result)).not.toContain('jsfcljs');
        });

        it('returns SESSION_EXPIRED if Playwright entry fails on session', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({
                success: false,
                error: 'Session expired'
            });

            const result = await service.getCourseFiles('C1', 'Math');

            expect(result).toEqual({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Session expired' } });
            expect(mockHttp.getCourseFiles).not.toHaveBeenCalled();
        });

        it('propagates a parse failure instead of returning an empty course', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockHttp.getCourseFiles.mockResolvedValue({
                success: false,
                error: 'SIGAA course selector drift: required JSF structure is missing (form).'
            });

            const result = await service.getCourseFiles('C1', 'Math');

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('SELECTOR_DRIFT');
        });
    });

    // ── downloadFile ────────────────────────────────────────
    describe('downloadFile()', () => {
        beforeEach(() => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockPlaywright.navigateToFilesSection.mockResolvedValue({ success: true, html: '<files></files>' });
        });

        it('resolves the JSF script from the fresh page by id and succeeds on first HTTP attempt (ARCH-001)', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/doc.pdf' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalled();
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockHttp.downloadFile.mock.calls[0][4]).toBe(SCRIPT);
            expect(result).toEqual({ success: true, data: { filePath: '/mock/downloads/doc.pdf' } });
        });

        it('prefers the id match over a same-name file', async () => {
            const impostor = { ...PARSED_DOC, id: '999', script: SCRIPT.replace('id,123', 'id,999') };
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [impostor, PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/doc.pdf' });

            await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockHttp.downloadFile.mock.calls[0][4]).toBe(SCRIPT);
        });

        it('does not select a file by name when the id does not match (ARCH-001 READ §4)', async () => {
            const onlyId999 = { ...PARSED_DOC, id: '999', script: SCRIPT.replace('id,123', 'id,999') };
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [onlyId999] });
            mockPlaywright.downloadFile.mockResolvedValue({ success: false, error: 'Playwright: link not found' });

            const forgedRef = { id: 'forjado', name: 'doc.pdf' };
            const result = await service.downloadFile('C1', 'Math', forgedRef, '/mock/downloads');

            expect(mockHttp.downloadFile).not.toHaveBeenCalled();
            expect(result).toEqual({ success: false, error: { code: 'DOWNLOAD_FAILED', message: 'Playwright: link not found' } });
        });

        it('falls back to the Dashboard HTML when the files section does not list the file', async () => {
            mockHttp.getCourseFiles
                .mockResolvedValueOnce({ success: true, files: [] })          // seção de arquivos
                .mockResolvedValueOnce({ success: true, files: [PARSED_DOC] }); // dashboard
            mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/doc.pdf' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockHttp.getCourseFiles).toHaveBeenNthCalledWith(1, 'C1', 'Math', '<files></files>');
            expect(mockHttp.getCourseFiles).toHaveBeenNthCalledWith(2, 'C1', 'Math', '<html></html>');
            expect(result.success).toBe(true);
        });

        it('falls back to Playwright without a script when neither static parse lists the file (ARCH-001 READ §2)', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [] });
            mockPlaywright.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockHttp.downloadFile).not.toHaveBeenCalled();
            expect(mockPlaywright.downloadFile).toHaveBeenCalledWith(
                'C1', 'Math', 'doc.pdf', '', '/mock/downloads', {}, undefined
            );
            expect(result).toEqual({ success: true, data: { filePath: '/mock/downloads/Math/doc.pdf' } });
        });

        it('returns DOWNLOAD_FAILED when Playwright fallback fails after neither static parse lists the file (ARCH-001 READ §2)', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [] });
            mockPlaywright.downloadFile.mockResolvedValue({ success: false, error: 'Playwright: link not found' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockHttp.downloadFile).not.toHaveBeenCalled();
            expect(result).toEqual({ success: false, error: { code: 'DOWNLOAD_FAILED', message: 'Playwright: link not found' } });
        });

        it('does not call Playwright when HTTP succeeds on first attempt', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockPlaywright.downloadFile).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('calls Playwright fallback when both HTTP attempts fail (BUG-004)', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: false, error: 'HTTP Error 302' });
            mockPlaywright.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(2);
            expect(mockPlaywright.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockPlaywright.downloadFile).toHaveBeenCalledWith(
                'C1', 'Math', 'doc.pdf', '', '/mock/downloads', {}, SCRIPT
            );
            expect(result).toEqual({ success: true, data: { filePath: '/mock/downloads/Math/doc.pdf' } });
        });

        it('returns DOWNLOAD_FAILED with the Playwright message when the fallback also fails (BUG-004)', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: false, error: 'HTTP Error 302' });
            mockPlaywright.downloadFile.mockResolvedValue({ success: false, error: 'Playwright: timeout' });

            const result = await service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');

            expect(result).toEqual({ success: false, error: { code: 'DOWNLOAD_FAILED', message: 'Playwright: timeout' } });
        });

        // ── DL-001: reserved name rejected before any network call ────────
        it('rejects Windows reserved name (CON) as INVALID_REQUEST without calling any network (DL-001)', async () => {
            const result = await service.downloadFile('C1', 'CON', { id: '1', name: '..' }, '/mock/downloads');

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('INVALID_REQUEST');
            expect(mockPlaywright.enterCourseAndGetHTML).not.toHaveBeenCalled();
            expect(mockHttp.downloadFile).not.toHaveBeenCalled();
            expect(mockPlaywright.downloadFile).not.toHaveBeenCalled();
        });
    });

    // ── downloadAllFiles ─────────────────────────────────────
    describe('downloadAllFiles()', () => {
        it('downloads via Playwright fallback when HTTP fails for a file the fresh page lists (BUG-004)', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: false, error: 'HTTP Error 302' });
            mockPlaywright.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });

            const onProgress = vi.fn();
            const result = await service.downloadAllFiles('C1', 'Math', [DOC_REF], '/mock/downloads', onProgress);

            expect(result).toEqual({
                success: true,
                data: {
                    downloaded: 1, skipped: 0, failed: 0,
                    results: [{ fileName: 'doc.pdf', status: 'downloaded', filePath: '/mock/downloads/Math/doc.pdf' }]
                }
            });
            expect(mockPlaywright.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockPlaywright.downloadFile).toHaveBeenCalledWith(
                'C1', 'Math', 'doc.pdf', '', '/mock/downloads', {}, SCRIPT
            );
        });

        it('batch: file absent from Dashboard and files section goes to Playwright without a script (ARCH-001 READ §2)', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [] });
            mockPlaywright.navigateToFilesSection.mockResolvedValue({ success: true, html: '<files></files>' });
            mockPlaywright.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });

            const result = await service.downloadAllFiles('C1', 'Math', [DOC_REF], '/mock/downloads');

            expect(mockPlaywright.navigateToFilesSection).toHaveBeenCalledTimes(1);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.downloaded).toBe(1);
                expect(result.data.failed).toBe(0);
            }
            expect(mockHttp.downloadFile).not.toHaveBeenCalled();
        });

        it('batch: uses the files-section script when the Dashboard lacks the file', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            // Dashboard parse returns no files
            mockHttp.getCourseFiles
                .mockResolvedValueOnce({ success: true, files: [] })          // files section parse (called in _downloadFileInternal per-file? No — in batch it's different)
                .mockResolvedValueOnce({ success: true, files: [PARSED_DOC] }); // Dashboard parse in batch
            mockPlaywright.navigateToFilesSection.mockResolvedValue({ success: true, html: '<files></files>' });
            mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/doc.pdf' });

            const result = await service.downloadAllFiles('C1', 'Math', [DOC_REF], '/mock/downloads');

            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockHttp.downloadFile.mock.calls[0][4]).toBe(SCRIPT);
            expect(mockPlaywright.downloadFile).not.toHaveBeenCalled();
        });

        it('batch: does not navigate to the files section when the Dashboard already lists every file', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/doc.pdf' });

            const result = await service.downloadAllFiles('C1', 'Math', [DOC_REF], '/mock/downloads');

            expect(mockPlaywright.navigateToFilesSection).not.toHaveBeenCalled();
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
        });
    });

    // ── DATA-002: logout esquece a sessão; diagnósticos são zeráveis ──
    describe('logout() / clearDiagnostics() (DATA-002)', () => {
        it('logout forgets the Playwright session (not just close), resets the HTTP session and the active account', async () => {
            setActiveAccount(deriveAccountId('user'));

            await service.logout();

            expect(mockPlaywright.logout).toHaveBeenCalledTimes(1);
            expect(mockHttp.resetSession).toHaveBeenCalledTimes(1);
            expect(getActiveAccount()).toBeNull();
        });

        it('clearDiagnostics resets the scraper log', () => {
            service.clearDiagnostics();

            expect(mockHttp.resetLog).toHaveBeenCalledTimes(1);
        });

        it('clearDiagnostics apaga os diagnósticos estruturais (PORTAL-003)', () => {
            const clear = vi.spyOn(diagnosticsService, 'clear').mockImplementation(() => {});

            service.clearDiagnostics();

            expect(clear).toHaveBeenCalledTimes(1);
            clear.mockRestore();
        });
    });

    // ── CONC-001: um dono da sessão por vez; logout é a fronteira segura ──
    //
    // Cada método público que toca o Playwright roda dentro de
    // `this.operations.run(...)`. `logout()` é `shutdown`: aborta o que está em
    // voo, espera parar, e só então fecha o navegador. A operação abortada
    // devolve `CANCELLED` na próxima fronteira (entre arquivos, entre
    // tentativas, entre notícias) — nunca continua nem inventa sucesso.
    describe('session operations (CONC-001)', () => {
        const FILES3 = [
            PARSED_DOC,
            { ...PARSED_DOC, id: '124', name: 'b.pdf', script: SCRIPT.replace('id,123', 'id,124') },
            { ...PARSED_DOC, id: '125', name: 'c.pdf', script: SCRIPT.replace('id,123', 'id,125') },
        ];
        const REFS3 = FILES3.map(f => ({ id: f.id, name: f.name }));
        const NEWS3 = ['N1', 'N2', 'N3'].map(id => ({ id, title: `Aviso ${id}`, date: '01/01/2026', notification: 'Sim', script: SCRIPT }));
        const ENTERED = { success: true, html: '<html></html>' };

        function deferred<T>() {
            let resolve!: (value: T) => void;
            const promise = new Promise<T>(res => { resolve = res; });
            return { promise, resolve };
        }
        const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

        beforeEach(() => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue(ENTERED);
            mockPlaywright.navigateToFilesSection.mockResolvedValue({ success: true, html: '<files></files>' });
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: FILES3, news: [] });
        });

        it('two interactive calls never overlap on the Playwright page', async () => {
            const first = deferred<typeof ENTERED>();
            mockPlaywright.enterCourseAndGetHTML
                .mockImplementationOnce(() => first.promise)
                .mockResolvedValue(ENTERED);

            const a = service.getCourseFiles('C1', 'A');
            const b = service.getCourseFiles('C2', 'B');
            await tick();
            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalledTimes(1);

            first.resolve(ENTERED);
            await Promise.all([a, b]);

            expect(mockPlaywright.enterCourseAndGetHTML.mock.calls.map((call: unknown[]) => call[0])).toEqual(['C1', 'C2']);
        });

        it('downloadAllFiles stops between files when logout arrives, answers CANCELLED, and the browser closes only afterwards', async () => {
            const first = deferred<{ success: boolean; filePath?: string }>();
            mockHttp.downloadFile
                .mockImplementationOnce(() => first.promise)
                .mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/x.pdf' });

            const download = service.downloadAllFiles('C1', 'Math', REFS3, '/mock/downloads');
            await tick();
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);

            const logout = service.logout();
            await tick();
            // Ainda há um download em voo: o navegador não pode fechar por baixo dele.
            expect(mockPlaywright.logout).not.toHaveBeenCalled();

            first.resolve({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });
            const result = await download;
            await logout;

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('CANCELLED');
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockPlaywright.downloadFile).not.toHaveBeenCalled();
            expect(mockPlaywright.logout).toHaveBeenCalledTimes(1);
        });

        it('downloadFile does not re-enter the course for a retry once logout was requested', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_DOC] });
            const first = deferred<{ success: boolean; error?: string }>();
            mockHttp.downloadFile
                .mockImplementationOnce(() => first.promise)
                .mockResolvedValue({ success: false, error: 'HTTP Error 302' });

            const download = service.downloadFile('C1', 'Math', DOC_REF, '/mock/downloads');
            await tick();
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
            const logout = service.logout();
            await tick();

            first.resolve({ success: false, error: 'HTTP Error 302' });
            const result = await download;
            await logout;

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('CANCELLED');
            // Sem a segunda entrada na disciplina nem o fallback Playwright.
            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalledTimes(1);
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
            expect(mockPlaywright.downloadFile).not.toHaveBeenCalled();
        });

        it('loadAllNews stops between news items once logout was requested', async () => {
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [], news: NEWS3 });
            const first = deferred<{ success: boolean; news?: { content: string } }>();
            mockPlaywright.getNewsDetail
                .mockImplementationOnce(() => first.promise)
                .mockResolvedValue({ success: true, news: { content: 'x' } });

            const load = service.loadAllNews('C1', 'Math');
            await tick();
            expect(mockPlaywright.getNewsDetail).toHaveBeenCalledTimes(1);
            const logout = service.logout();
            await tick();

            first.resolve({ success: true, news: { content: 'primeira' } });
            const result = await load;
            await logout;

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('CANCELLED');
            expect(mockPlaywright.getNewsDetail).toHaveBeenCalledTimes(1);
        });

        it('an operation queued behind a logout answers CANCELLED without touching Playwright', async () => {
            const first = deferred<{ success: boolean; filePath?: string }>();
            mockHttp.downloadFile
                .mockImplementationOnce(() => first.promise)
                .mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/x.pdf' });

            const download = service.downloadAllFiles('C1', 'Math', REFS3, '/mock/downloads');
            await tick();
            const later = service.getCourseFiles('C2', 'B');
            const logout = service.logout();
            await tick();

            first.resolve({ success: true, filePath: '/mock/downloads/Math/doc.pdf' });
            await download;
            const result = await later;
            await logout;

            expect(result.success).toBe(false);
            if (!result.success) expect(result.error.code).toBe('CANCELLED');
            // Só a entrada do download; a disciplina C2 nunca foi aberta.
            expect(mockPlaywright.enterCourseAndGetHTML.mock.calls.map((call: unknown[]) => call[0])).toEqual(['C1']);
            expect(mockPlaywright.logout).toHaveBeenCalledTimes(1);
        });
    });
});
