import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
    const logger: { info: any; warn: any; error: any; scope: any } = {
        info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(),
    };
    logger.scope.mockImplementation(() => logger);
    return {
        axios: { get: vi.fn(), post: vi.fn() },
        chromium: { launch: vi.fn() },
        stream: { writable: true, on: vi.fn(), write: vi.fn() },
        logger,
    };
});

vi.mock('axios', () => ({ default: runtime.axios }));
vi.mock('playwright', () => ({ chromium: runtime.chromium }));
vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => 'C:/tmp/portal-tests' } }));
vi.mock('fs', () => ({ createWriteStream: () => runtime.stream }));
vi.mock('../../electron/services/logger.service', () => ({ logger: runtime.logger }));

import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';
import { SigaaService } from '../../electron/services/sigaa.service';

// Synthetic documents, never captured from an authenticated session.
const loginHtml = '<form action="/sigaa/logar.do"><input name="user.login"><input name="user.senha"><input name="entrar" type="submit"></form>';
const courseHtml = `<form name="formAva" action="/sigaa/ava/index.jsf">
    <input name="javax.faces.ViewState" value="fixture-state">
    <input name="formAva" value="formAva">
    </form><p>Nenhum material publicado.</p>`;
const portalHtml = `<h1>Portal do Discente</h1><form name="entry" action="/sigaa/verPortalDiscente.do">
    <input name="javax.faces.ViewState" value="fixture-state"><table><tr>
    <td><input name="idTurma" value="123"></td><td>
    <a id="entry:turmaVirtual" onclick="jsfcljs(document.forms['entry'],'entry:turmaVirtual,entry:turmaVirtual','');">Algorithms</a>
    </td></tr></table></form>`;
const menuHtml = courseHtml + `<a onclick="jsfcljs(document.forms['formAva'],'files,files','');"><span class="itemMenu"> Conteudo</span></a>`;

function scraper() {
    const service = new HttpScraperService();
    service.setCookies([{ name: 'JSESSIONID', value: 'fixture-cookie', domain: 'si3.ufc.br' }]);
    return service;
}

function response(data: string) {
    return { data, headers: {}, status: 200 };
}

function loginBrowser(startHtml: string, endHtml: string) {
    let html = startHtml;
    let url = 'https://si3.ufc.br/sigaa/verTelaLogin.do';
    const page = {
        goto: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        click: vi.fn(async () => { html = endHtml; url = 'https://si3.ufc.br/sigaa/paginaInicial.do'; }),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        content: vi.fn(async () => html),
        url: vi.fn(() => url),
        $: vi.fn().mockResolvedValue(null),
        isClosed: () => false
    };
    const context = {
        newPage: vi.fn().mockResolvedValue(page),
        cookies: vi.fn().mockResolvedValue([{ name: 'JSESSIONID', value: 'fixture-cookie', domain: 'si3.ufc.br' }]),
        close: vi.fn().mockResolvedValue(undefined)
    };
    const browser = { newContext: vi.fn().mockResolvedValue(context), close: vi.fn().mockResolvedValue(undefined) };
    runtime.chromium.launch.mockResolvedValue(browser);
    return { page, context, browser };
}

describe('PORTAL-001: production service compatibility boundary', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetAllMocks();
    });

    it('returns a stable session code for a login document supplied by Playwright', async () => {
        const result = await scraper().getCourseFiles('123', 'Algorithms', loginHtml);
        expect(result).toMatchObject({ success: false, errorCode: 'SESSION_EXPIRED' });
    });

    it('returns a stable selector code for an unrecognized course document', async () => {
        const result = await scraper().getCourseFiles('123', 'Algorithms', '<main>Unexpected layout</main>');
        expect(result).toMatchObject({ success: false, errorCode: 'SELECTOR_DRIFT' });
    });

    it('rejects an unrelated JSF form even when a nonempty ViewState exists', async () => {
        const result = await scraper().getCourseFiles('123', 'Algorithms',
            '<form name="preferences" action="/sigaa/preferences.jsf"><input name="javax.faces.ViewState" value="fixture-state"></form>');
        expect(result.success).toBe(false);
        expect(result).toMatchObject({ errorCode: 'SELECTOR_DRIFT' });
    });

    it('does not mistake a logout URL in course content for a login page', async () => {
        const result = await scraper().getCourseFiles('123', 'Algorithms',
            courseHtml + '<a href="/sigaa/verTelaLogin.do">Sair</a>');
        expect(result).toMatchObject({ success: true, files: [], news: [] });
    });

    it('classifies session expiry after the HTTP files POST, before parsing its response', async () => {
        runtime.axios.get.mockResolvedValue(response(menuHtml));
        runtime.axios.post.mockResolvedValue(response(loginHtml));
        const result = await scraper().getCourseFiles('123', 'Algorithms');
        expect(runtime.axios.post).toHaveBeenCalledOnce();
        expect(result).toMatchObject({ success: false, errorCode: 'SESSION_EXPIRED' });
    });

    it('does not submit a files action when its starting document lacks ViewState', async () => {
        runtime.axios.get.mockResolvedValue(response(menuHtml.replace('<input name="javax.faces.ViewState" value="fixture-state">', '')));
        runtime.axios.post.mockResolvedValue(response(courseHtml));
        const result = await scraper().getCourseFiles('123', 'Algorithms');
        expect(runtime.axios.post).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, errorCode: 'SELECTOR_DRIFT' });
    });

    it('distinguishes an expired entry page from an absent course', async () => {
        runtime.axios.get.mockResolvedValue(response(loginHtml));
        const result = await scraper().enterCourseHTTP('123');
        expect(result).toMatchObject({ success: false, errorCode: 'SESSION_EXPIRED' });
        expect(runtime.axios.post).not.toHaveBeenCalled();
    });

    it('reports NOT_FOUND only after recognizing the student portal structure', async () => {
        runtime.axios.get.mockResolvedValue(response(portalHtml));
        const result = await scraper().enterCourseHTTP('999');
        expect(result).toMatchObject({ success: false, errorCode: 'NOT_FOUND' });
        expect(runtime.axios.post).not.toHaveBeenCalled();
    });

    it('rejects a course entry end state containing only the generic conteudo element', async () => {
        runtime.axios.get.mockResolvedValue(response(portalHtml));
        runtime.axios.post.mockResolvedValue(response('<div id="conteudo">Unexpected layout</div>'));
        const result = await scraper().enterCourseHTTP('123');
        expect(result.success).toBe(false);
        expect(result).toMatchObject({ errorCode: 'SELECTOR_DRIFT' });
    });

    it('invalidates old course request state after a failed refresh instead of posting a stale token', async () => {
        const service = scraper();
        const initial = await service.getCourseFiles('123', 'Algorithms', courseHtml);
        expect(initial.success).toBe(true);
        await service.getCourseFiles('123', 'Algorithms', loginHtml);
        runtime.axios.post.mockRejectedValue(new Error('Unexpected stale download request'));
        const result = await service.downloadFile('123', '42', 'example.txt', 'C:/tmp/portal-tests',
            "jsfcljs(document.forms['formAva'],'download,download,id,42,key,fixture-key','');");
        expect(runtime.axios.post).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, errorCode: 'SESSION_EXPIRED' });
    });

    it('invalidates old course request state after a drifted refresh, not only after session expiry', async () => {
        const service = scraper();
        const initial = await service.getCourseFiles('123', 'Algorithms', courseHtml);
        expect(initial.success).toBe(true);
        const refresh = await service.getCourseFiles('123', 'Algorithms', '<main>Unexpected layout</main>');
        expect(refresh.success).toBe(false);
        runtime.axios.post.mockRejectedValue(new Error('Unexpected stale download request'));
        const result = await service.downloadFile('123', '42', 'example.txt', 'C:/tmp/portal-tests',
            "jsfcljs(document.forms['formAva'],'download,download,id,42,key,fixture-key','');");
        expect(runtime.axios.post).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
    });

    it('does not fill credentials into an unrecognized starting login document', async () => {
        const { page } = loginBrowser('<main>Unexpected layout</main>', portalHtml);
        const result = await new PlaywrightLoginService().login('fixture-user', 'fixture-password');
        expect(page.fill).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, errorCode: 'SELECTOR_DRIFT' });
    });

    it('does not authenticate solely because the final URL stopped being the login URL', async () => {
        const { context, browser } = loginBrowser(loginHtml, '<main>Unexpected layout</main>');
        const result = await new PlaywrightLoginService().login('fixture-user', 'fixture-password');
        expect(result.success).toBe(false);
        expect(result).toMatchObject({ errorCode: 'SELECTOR_DRIFT' });
        expect(context.cookies).not.toHaveBeenCalled();
        expect(browser.close).toHaveBeenCalledOnce();
    });

    it('returns a stable selector code when the login field cannot be used', async () => {
        const { page } = loginBrowser(loginHtml, portalHtml);
        page.fill.mockRejectedValueOnce(new Error('locator.fill: Timeout for input[name="user.login"]'));
        const result = await new PlaywrightLoginService().login('fixture-user', 'fixture-password');
        expect(result).toMatchObject({ success: false, errorCode: 'SELECTOR_DRIFT' });
    });

    it.each(['login', 'getCourses', 'getCourseFiles'] as const)(
        'preserves a producer error code through SigaaService.%s independently of message wording', async (operation) => {
            // The producer boundary is isolated only here to test the real IPC-facing
            // orchestrator's translation. All document tests above use real producers.
            const failure = { success: false, error: 'Estrutura incompatível.', errorCode: 'SELECTOR_DRIFT' as const };
            vi.spyOn(PlaywrightLoginService.prototype, 'login').mockResolvedValue(failure);
            vi.spyOn(PlaywrightLoginService.prototype, 'getCourses').mockResolvedValue(failure);
            vi.spyOn(PlaywrightLoginService.prototype, 'enterCourseAndGetHTML').mockResolvedValue(failure);
            const service = new SigaaService();
            const result = operation === 'login'
                ? await service.login('fixture-user', 'fixture-password')
                : operation === 'getCourses'
                    ? await service.getCourses()
                    : await service.getCourseFiles('123', 'Algorithms');
            expect(result).toEqual({
                success: false,
                error: { code: 'SELECTOR_DRIFT', message: 'Estrutura incompatível.' }
            });
        }
    );
});
