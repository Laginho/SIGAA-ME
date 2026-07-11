/**
 * Contract tests for portal changes. These use Playwright-shaped mocks instead
 * of SIGAA itself, so they are safe to run in CI without user credentials.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
    chromium: { launch: vi.fn() },
    axios: { get: vi.fn(), post: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    stream: { writable: true, on: vi.fn(), write: vi.fn() }
}));

vi.mock('playwright', () => ({ chromium: runtime.chromium }));
vi.mock('axios', () => ({ default: runtime.axios }));
vi.mock('electron', () => ({
    app: {
        isPackaged: true,
        getPath: vi.fn(() => 'C:\\tmp\\sigaa-me-vitest')
    }
}));
vi.mock('../../electron/services/logger.service', () => ({ logger: runtime.logger }));
vi.mock('fs', () => ({
    createWriteStream: vi.fn(() => runtime.stream),
    promises: { writeFile: vi.fn() }
}));

import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';

function createLocator(options: { visible?: boolean; clickError?: Error; text?: string[] } = {}) {
    const locator: any = {
        first: vi.fn(() => locator),
        filter: vi.fn(() => locator),
        locator: vi.fn(() => locator),
        isVisible: vi.fn().mockResolvedValue(options.visible ?? false),
        click: options.clickError ? vi.fn().mockRejectedValue(options.clickError) : vi.fn().mockResolvedValue(undefined),
        allTextContents: vi.fn().mockResolvedValue(options.text ?? [])
    };
    return locator;
}

function createNavigationHarness(url = 'https://si3.ufc.br/sigaa/paginaInicial.do') {
    const studentPortal = createLocator({ visible: true });
    const page: any = {
        goto: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        url: vi.fn(() => url),
        $: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn(),
        content: vi.fn().mockResolvedValue('<html><title>Portal</title></html>'),
        on: vi.fn(),
        locator: vi.fn(() => studentPortal),
        isClosed: vi.fn(() => false)
    };
    const context: any = {
        newPage: vi.fn().mockResolvedValue(page),
        cookies: vi.fn().mockResolvedValue([{ name: 'JSESSIONID', value: 'fresh', domain: 'si3.ufc.br' }]),
        addCookies: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined)
    };
    const browser: any = {
        newContext: vi.fn().mockResolvedValue(context),
        close: vi.fn().mockResolvedValue(undefined)
    };

    runtime.chromium.launch.mockResolvedValue(browser);
    return { browser, context, page, studentPortal };
}

describe('Playwright portal navigation resilience', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('models the successful login navigation state and retains fresh cookies for later requests', async () => {
        const { context, page } = createNavigationHarness();
        const service = new PlaywrightLoginService();

        const result = await service.login('student', 'correct-password');

        expect(result).toMatchObject({
            success: true,
            cookies: [{ name: 'JSESSIONID', value: 'fresh' }],
            userName: 'User'
        });
        expect(page.goto).toHaveBeenCalledWith('https://si3.ufc.br/sigaa/verTelaLogin.do');
        expect(page.fill).toHaveBeenNthCalledWith(1, 'input[name="user.login"]', 'student');
        expect(page.fill).toHaveBeenNthCalledWith(2, 'input[name="user.senha"]', 'correct-password');
        expect(page.click).toHaveBeenCalledWith('input[name="entrar"]');
        expect(page.waitForLoadState).toHaveBeenCalledWith('networkidle');
        await expect(service.getCookies()).resolves.toEqual(await context.cookies());
    });

    it('turns a login-field selector timeout into an actionable selector-drift error and closes the browser', async () => {
        const { browser, page } = createNavigationHarness();
        page.fill.mockRejectedValueOnce(new Error('locator.fill: Timeout 5000ms exceeded for input[name="user.login"]'));
        const service = new PlaywrightLoginService();

        const result = await service.login('student', 'password');

        expect(result.success).toBe(false);
        expect(result.error).toContain('SIGAA login selector drift');
        expect(result.error).toContain('username field');
        expect(result.error).toContain('input[name="user.login"]');
        expect(browser.close).toHaveBeenCalledOnce();
    });

    it('fails closed when an authenticated browser is redirected back to the login page', async () => {
        const { browser } = createNavigationHarness('https://si3.ufc.br/sigaa/verTelaLogin.do');
        const service = new PlaywrightLoginService();
        (service as any).storedCookies = [{ name: 'JSESSIONID', value: 'expired', domain: 'si3.ufc.br' }];

        const result = await service.getCourses();

        expect(result).toEqual({ success: false, error: 'Session expired - please login again' });
        expect(browser.close).toHaveBeenCalledOnce();
    });

    it('reports a portal-layout change when neither course selector exists after navigation', async () => {
        const { browser, page } = createNavigationHarness();
        page.evaluate.mockResolvedValue({
            courses: [],
            selectorDiagnostics: { courseIdInputs: 0, virtualClassroomLinks: 0 }
        });
        const service = new PlaywrightLoginService();
        (service as any).storedCookies = [{ name: 'JSESSIONID', value: 'valid', domain: 'si3.ufc.br' }];

        const result = await service.getCourses();

        expect(result.success).toBe(false);
        expect(result.error).toContain('SIGAA portal selector drift');
        expect(result.error).toContain('input[name="idTurma"]');
        expect(browser.close).toHaveBeenCalledOnce();
    });

    it('does not silently continue when the files navigation selector is absent', async () => {
        const missing = createLocator({ visible: false, text: ['Início', 'Turmas', 'Ajuda'] });
        const page: any = {
            locator: vi.fn(() => missing),
            waitForTimeout: vi.fn()
        };
        const service = new PlaywrightLoginService();
        (service as any).browser = {};
        (service as any).page = page;

        const result = await service.navigateToFilesSection();

        expect(result.success).toBe(false);
        expect(result.error).toContain('SIGAA selector drift');
        expect(result.error).toContain('Conteúdo');
        expect(page.waitForTimeout).not.toHaveBeenCalled();
    });

    it('returns an actionable error as soon as JSF files selectors time out instead of waiting indefinitely', async () => {
        const visible = createLocator({ visible: true });
        const page: any = {
            locator: vi.fn(() => visible),
            waitForFunction: vi.fn().mockRejectedValue(new Error('Timeout 8000ms exceeded')),
            waitForTimeout: vi.fn(),
            content: vi.fn()
        };
        const service = new PlaywrightLoginService();
        (service as any).browser = {};
        (service as any).page = page;

        const result = await service.navigateToFilesSection();

        expect(result.success).toBe(false);
        expect(result.error).toContain('SIGAA selector drift');
        expect(result.error).toContain('a[onclick*="jsfcljs"]');
        expect(page.waitForTimeout).not.toHaveBeenCalled();
    });
});

describe('HTTP scraper structural validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function authenticatedScraper() {
        const scraper = new HttpScraperService();
        scraper.setCookies([{ name: 'JSESSIONID', value: 'valid', domain: 'si3.ufc.br' }]);
        return scraper;
    }

    it('recognizes a login-page response as an expired session rather than parsing an empty course', async () => {
        const result = await authenticatedScraper().getCourseFiles(
            '123',
            'Algorithms',
            '<html><form action="verTelaLogin.do"><input name="user.login"></form></html>'
        );

        expect(result).toEqual({
            success: false,
            error: 'Session expired: SIGAA returned the login page instead of course content. Re-authenticate before requesting files.'
        });
    });

    it('rejects an HTML response with missing JSF form selectors instead of returning an empty file list', async () => {
        const result = await authenticatedScraper().getCourseFiles(
            '123',
            'Algorithms',
            '<html><title>Unexpected SIGAA page</title><main>Maintenance</main></html>'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('SIGAA course selector drift');
        expect(result.error).toContain('javax.faces.ViewState');
        expect(result.error).toContain('form[name="formAva"]');
    });

    it('continues to accept a valid empty course page and records its JSF state for follow-up requests', async () => {
        const result = await authenticatedScraper().getCourseFiles(
            '123',
            'Algorithms',
            `<html><form name="formAva" action="/sigaa/ava/index.jsf">
                <input name="javax.faces.ViewState" value="state-123">
                <input name="formAva" value="formAva">
            </form><p>Nenhum material publicado.</p></html>`
        );

        expect(result).toMatchObject({ success: true, files: [], news: [] });
    });
});
