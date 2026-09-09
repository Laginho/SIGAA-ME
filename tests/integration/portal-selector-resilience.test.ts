/**
 * Contract tests for portal changes. These use Playwright-shaped mocks instead
 * of SIGAA itself, so they are safe to run in CI without user credentials.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        createWriteStream: vi.fn(() => runtime.stream),
        promises: { ...actual.promises, writeFile: vi.fn() }
    };
});

import { readFileSync } from 'fs';
import path from 'path';
import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';
import { PORTAL_ADAPTER_VERSION, classify, validateCourseListDocument, validateLoginStart } from '../../electron/sigaa/portal-adapter';
import { diagnosticsService } from '../../electron/services/diagnostics.service';

const LOGIN_DOCUMENT = '<form action="/sigaa/logar.do"><input name="user.login"><input name="user.senha"><input name="entrar" type="submit"></form>';

/**
 * PORTAL-003: o diagnóstico grava em disco. O espião mantém os testes fora do
 * `userData` e deixa a asserção ser o payload, não o arquivo.
 */
let recordSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { recordSpy = vi.spyOn(diagnosticsService, 'record').mockImplementation(() => {}); });
afterEach(() => { recordSpy.mockRestore(); });

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
    const loginDocument = LOGIN_DOCUMENT;
    const portalDocument = '<h1>Portal do Discente</h1><a href="/sigaa/verPortalDiscente.do">Menu Discente</a><span class="nome_usuario">User</span>';
    let currentDocument = url.includes('verTelaLogin') ? loginDocument : portalDocument;
    let currentUrl = url;
    const page: any = {
        goto: vi.fn(async (target: string) => {
            currentDocument = target.includes('verTelaLogin') || url.includes('verTelaLogin') ? loginDocument : portalDocument;
            currentUrl = url.includes('verTelaLogin') ? url : target;
        }),
        fill: vi.fn().mockResolvedValue(undefined),
        click: vi.fn(async () => { currentDocument = portalDocument; currentUrl = url; }),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        url: vi.fn(() => currentUrl),
        $: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn(),
        content: vi.fn(async () => currentDocument),
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

        expect(result).toEqual({ success: false, error: 'Session expired - please login again', errorCode: 'SESSION_EXPIRED' });
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
            url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
            content: vi.fn().mockResolvedValue('<form name="formAva" action="/sigaa/ava/index.jsf"><input name="javax.faces.ViewState" value="fixture-state"></form>'),
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
        let clicked = false;
        visible.click.mockImplementation(async () => { clicked = true; });
        const page: any = {
            locator: vi.fn(() => visible),
            url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
            waitForFunction: vi.fn().mockRejectedValue(new Error('Timeout 8000ms exceeded')),
            waitForTimeout: vi.fn(),
            content: vi.fn(async () => clicked ? '<main>Unexpected layout</main>' : '<form name="formAva" action="/sigaa/ava/index.jsf"><input name="javax.faces.ViewState" value="fixture-state"></form>')
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
            errorCode: 'SESSION_EXPIRED',
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

describe('PORTAL-002: sanitized versioned portal fixtures', () => {
    const fixture = (name: string) =>
        readFileSync(path.join(process.cwd(), 'tests/fixtures/sigaa', PORTAL_ADAPTER_VERSION, name), 'utf8');
    const AVA_URL = 'https://si3.ufc.br/sigaa/ava/index.jsf';
    const NON_AVA_URL = 'https://si3.ufc.br/sigaa/portais/discente/discente.jsf';

    it('classifies the login fixture as LOGIN and accepts it as a login start document', () => {
        const html = fixture('login.html');

        expect(classify(html)).toBe('LOGIN');
        expect(validateLoginStart(html)).toBeNull();
    });

    it('classifies the invalid-credentials fixture as LOGIN despite the visible error banner', () => {
        const html = fixture('login-invalid-credentials.html');

        expect(classify(html)).toBe('LOGIN');
        expect(validateLoginStart(html)).toBeNull();
    });

    it('treats the login fixture reached instead of the student portal as an expired session', () => {
        // Reaproveita login.html: a página é a mesma, o que muda é qual
        // documento a operação esperava encontrar.
        const html = fixture('login.html');

        expect(validateCourseListDocument(html)).toEqual({
            code: 'SESSION_EXPIRED',
            message: 'Session expired: SIGAA returned the login page instead of the student portal.'
        });
    });

    it('classifies the student-home fixture as STUDENT_HOME', () => {
        expect(classify(fixture('student-home.html'))).toBe('STUDENT_HOME');
    });

    it('classifies and accepts an empty student portal (0 turmas) by .nome_usuario alone', () => {
        const html = fixture('student-portal-empty.html');

        expect(classify(html)).toBe('STUDENT_PORTAL');
        expect(validateCourseListDocument(html)).toBeNull();
    });

    it('classifies and accepts a populated student portal (N turmas)', () => {
        const html = fixture('student-portal-populated.html');

        expect(classify(html)).toBe('STUDENT_PORTAL');
        expect(validateCourseListDocument(html)).toBeNull();
    });

    it('classifies the course-home fixture as COURSE_HOME outside the /ava/ URL family', () => {
        expect(classify(fixture('course-home.html'), NON_AVA_URL)).toBe('COURSE_HOME');
    });

    it('classifies a course page carrying news as FILES_SECTION, same as any other AVA form page', () => {
        const html = readFileSync(path.join(process.cwd(), 'tests/fixtures', 'course-page-with-news.html'), 'utf8');

        expect(classify(html, AVA_URL)).toBe('FILES_SECTION');
    });

    // access-denied.html e maintenance.html documentam uma lacuna, não um
    // comportamento correto: nada em portal-state-classifier.ts reconhece
    // "Acesso Negado" ou manutenção programada. Ambos caem em UNKNOWN e viram
    // SELECTOR_DRIFT genérico. Reconhecer esses estados de verdade é
    // PORTAL-003/PORTAL-005; se esta asserção quebrar porque alguém passou a
    // classificar como ACCESS_DENIED, ótimo — atualize o teste, não a fixture.
    it('does not yet recognize the access-denied fixture as its own state (documents the PORTAL-003/005 gap)', () => {
        const html = fixture('access-denied.html');

        expect(classify(html)).toBe('UNKNOWN');
        expect(validateCourseListDocument(html)?.code).toBe('SELECTOR_DRIFT');
    });

    it('does not yet recognize the maintenance fixture as its own state (documents the PORTAL-003/005 gap)', () => {
        const html = fixture('maintenance.html');

        expect(classify(html)).toBe('UNKNOWN');
        expect(validateCourseListDocument(html)?.code).toBe('SELECTOR_DRIFT');
    });
});

describe('Diagnóstico estrutural nos pontos de falha (PORTAL-003)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function driftingCourseList() {
        const harness = createNavigationHarness();
        harness.page.evaluate.mockResolvedValue({
            courses: [],
            selectorDiagnostics: { courseIdInputs: 0, virtualClassroomLinks: 0 }
        });
        const service = new PlaywrightLoginService();
        (service as any).storedCookies = [{ name: 'JSESSIONID', value: 'valid', domain: 'si3.ufc.br' }];
        return { ...harness, service };
    }

    function pageEnteringCourse(portalDocument: string) {
        const { page } = createNavigationHarness();
        page.content.mockResolvedValue(portalDocument);
        const service = new PlaywrightLoginService();
        (service as any).browser = {};
        (service as any).context = { newPage: vi.fn() };
        (service as any).page = page;
        return { page, service };
    }

    it('grava o diagnóstico quando os seletores da lista de turmas somem', async () => {
        const { service } = driftingCourseList();

        const result = await service.getCourses();

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        const diagnostic = recordSpy.mock.calls[0][0] as any;
        expect(diagnostic).toMatchObject({
            state: 'STUDENT_PORTAL',
            urlFamily: '/sigaa/paginaInicial.do',
            adapterVersion: PORTAL_ADAPTER_VERSION,
            selectorCounts: { courseIdInputs: 0, virtualClassroomLinks: 0 }
        });
        expect(diagnostic.domFingerprint).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(diagnostic)).not.toContain('nome_usuario');
    });

    it('preserva o SELECTOR_DRIFT quando a gravação do diagnóstico falha', async () => {
        const { service } = driftingCourseList();
        recordSpy.mockImplementation(() => { throw new Error('EPERM: operation not permitted'); });

        const result = await service.getCourses();

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(result.error).toContain('SIGAA portal selector drift');
        expect(runtime.logger.error).toHaveBeenCalled();
    });

    it('preserva o SELECTOR_DRIFT quando nem o HTML da página pode ser lido', async () => {
        const { page, service } = driftingCourseList();
        const document = await page.content();
        page.content
            .mockResolvedValueOnce(document)
            .mockRejectedValueOnce(new Error('Target page, context or browser has been closed'));

        const result = await service.getCourses();

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy.mock.calls[0][0]).toMatchObject({ state: 'UNKNOWN' });
    });

    it('grava o diagnóstico quando o pouso pós-login não é reconhecido', async () => {
        const { page } = createNavigationHarness();
        page.content
            .mockResolvedValueOnce(LOGIN_DOCUMENT)
            .mockResolvedValue('<main>Layout inesperado</main>');
        const service = new PlaywrightLoginService();

        const result = await service.login('student', 'password');

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy.mock.calls[0][0]).toMatchObject({
            state: 'UNKNOWN',
            urlFamily: '/sigaa/paginaInicial.do',
            adapterVersion: PORTAL_ADAPTER_VERSION,
            selectorCounts: {}
        });
    });

    it('grava o diagnóstico quando o portal é rejeitado antes da entrada na turma', async () => {
        const { service } = pageEnteringCourse('<main>Layout inesperado</main>');

        const result = await service.enterCourseAndGetHTML('111', 'Cálculo I');

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy.mock.calls[0][0]).toMatchObject({
            state: 'UNKNOWN',
            urlFamily: '/sigaa/paginaInicial.do',
            adapterVersion: PORTAL_ADAPTER_VERSION
        });
    });

    it('não grava diagnóstico quando a rejeição é sessão expirada, não drift', async () => {
        const { service } = pageEnteringCourse(LOGIN_DOCUMENT);

        const result = await service.enterCourseAndGetHTML('111', 'Cálculo I');

        expect(result.errorCode).toBe('SESSION_EXPIRED');
        expect(recordSpy).not.toHaveBeenCalled();
    });

    it('grava o diagnóstico quando o HTML inicial do login não tem o formulário esperado', async () => {
        const { browser, page } = createNavigationHarness();
        page.content.mockResolvedValueOnce('<main>Layout novo sem formulario</main>');
        const service = new PlaywrightLoginService();

        const result = await service.login('student', 'password');

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy.mock.calls[0][0]).toMatchObject({
            state: 'UNKNOWN',
            urlFamily: '/sigaa/verTelaLogin.do',
            adapterVersion: PORTAL_ADAPTER_VERSION,
            selectorCounts: {}
        });
        expect(browser.close).toHaveBeenCalledOnce();
    });

    it('grava o diagnóstico quando o preenchimento do campo de login estoura por timeout de seletor', async () => {
        const { browser, page } = createNavigationHarness();
        page.fill.mockRejectedValueOnce(new Error('locator.fill: Timeout 5000ms exceeded for input[name="user.login"]'));
        const service = new PlaywrightLoginService();

        const result = await service.login('student', 'password');

        expect(result.errorCode).toBe('SELECTOR_DRIFT');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(recordSpy.mock.calls[0][0]).toMatchObject({
            state: 'LOGIN',
            urlFamily: '/sigaa/verTelaLogin.do',
            adapterVersion: PORTAL_ADAPTER_VERSION,
            selectorCounts: {}
        });
        expect(page.content).toHaveBeenCalled();
        expect(browser.close).toHaveBeenCalledOnce();
    });

    it('não grava diagnóstico quando a exceção de login é indisponibilidade de portal, não drift', async () => {
        const { page } = createNavigationHarness();
        page.waitForLoadState.mockRejectedValueOnce(new Error('Timeout 30000ms exceeded waiting for navigation'));
        const service = new PlaywrightLoginService();

        const result = await service.login('student', 'password');

        expect(result.errorCode).toBe('PORTAL_UNAVAILABLE');
        expect(recordSpy).not.toHaveBeenCalled();
    });
});
