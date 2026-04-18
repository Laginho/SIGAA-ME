/**
 * Unit Tests: SigaaService
 * 
 * Tests the orchestration layer (`SigaaService`) which coordinates
 * the PlaywrightLoginService and HttpScraperService.
 * 
 * We mock Playwright and Axios completely, so these run instantly
 * without a real browser or network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock the dependencies before importing the service
vi.mock('../../electron/services/playwright-login.service', () => {
    return {
        PlaywrightLoginService: class {
            login = vi.fn();
            close = vi.fn();
            getCourses = vi.fn();
            enterCourseAndGetHTML = vi.fn();
            navigateToFilesSection = vi.fn();
            loadAllNews = vi.fn();
            downloadFileWithPlaywright = vi.fn();
            getCookies = vi.fn().mockReturnValue([]);
        }
    };
});

vi.mock('../../electron/services/http-scraper.service', () => {
    return {
        HttpScraperService: class {
            setCookies = vi.fn();
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
        it('returns success and sets HTTP cookies when Playwright succeeds', async () => {
            mockPlaywright.login.mockResolvedValue({
                success: true,
                cookies: [{ name: 'TEST', value: '123' }],
                userName: 'Aluno Teste'
            });

            const result = await service.login('user', 'pass');

            expect(mockPlaywright.login).toHaveBeenCalledWith('user', 'pass');
            expect(mockHttp.setCookies).toHaveBeenCalledWith([{ name: 'TEST', value: '123' }]);
            expect(result.success).toBe(true);
            expect(result.account?.name).toBe('Aluno Teste');
        });

        it('returns failure when Playwright fails', async () => {
            mockPlaywright.login.mockResolvedValue({
                success: false,
                error: 'Credenciais inválidas'
            });

            const result = await service.login('user', 'wrongpass');

            expect(result.success).toBe(false);
            expect(result.message).toBe('Credenciais inválidas');
            expect(mockHttp.setCookies).not.toHaveBeenCalled();
        });
    });

    // ── getCourses ──────────────────────────────────────────
    describe('getCourses()', () => {
        it('returns courses from Playwright', async () => {
            mockPlaywright.getCourses.mockResolvedValue({
                success: true,
                courses: [{ id: 'C1', name: 'Math' }]
            });

            const result = await service.getCourses();

            expect(mockPlaywright.getCourses).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.courses).toHaveLength(1);
        });
    });

    // ── getCourseFiles ──────────────────────────────────────
    describe('getCourseFiles()', () => {
        it('returns files and news when both entry and scrape succeed', async () => {
            // 1. Playwright enters the course
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({
                success: true,
                html: '<html>...</html>'
            });

            // 2. HTTP Scraper parses the HTML
            mockHttp.getCourseFiles.mockResolvedValue({
                success: true,
                files: [{ id: 'F1', name: 'doc.pdf' }],
                news: [{ id: 'N1', title: 'Aviso' }]
            });

            const result = await service.getCourseFiles('C1', 'Math');

            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalledWith('C1', 'Math');
            expect(mockHttp.getCourseFiles).toHaveBeenCalledWith('C1', 'Math', '<html>...</html>');
            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(1);
            expect(result.news).toHaveLength(1);
        });

        it('returns failure if Playwright entry fails', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({
                success: false,
                error: 'Session expired'
            });

            const result = await service.getCourseFiles('C1', 'Math');

            expect(result.success).toBe(false);
            expect(mockHttp.getCourseFiles).not.toHaveBeenCalled();
        });
    });

    // ── downloadFile ────────────────────────────────────────
    describe('downloadFile()', () => {
        it('succeeds on first HTTP attempt', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockPlaywright.navigateToFilesSection.mockResolvedValue({ success: true, html: '<html></html>' });
            
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [] });

            mockHttp.downloadFile.mockResolvedValue({
                success: true,
                filePath: '/mock/downloads/doc.pdf'
            });

            // downloadFile(courseId, courseName, fileName, _fileUrl, basePath, _downloadedFiles, script)
            const result = await service.downloadFile('C1', 'Math', 'doc.pdf', '', '/mock/downloads', {}, 'jsfcljs,id,123');

            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalled();
            expect(mockHttp.downloadFile).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.filePath).toBe('/mock/downloads/doc.pdf');
        });

        it('fails after second HTTP attempt fails', async () => {
            mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
            mockPlaywright.navigateToFilesSection.mockResolvedValue({ success: true, html: '<html></html>' });
            
            mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [] });

            // Both HTTP attempts fail
            mockHttp.downloadFile.mockResolvedValue({
                success: false,
                error: 'HTTP Error 302'
            });

            const result = await service.downloadFile('C1', 'Math', 'doc.pdf', '', '/mock/downloads', {}, 'jsfcljs,id,123');

            // It should have tried to enter the course twice (first try + retry)
            expect(mockPlaywright.enterCourseAndGetHTML).toHaveBeenCalledTimes(2);
            // It should have tried the HTTP download twice
            expect(mockHttp.downloadFile).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(false);
        });
});
