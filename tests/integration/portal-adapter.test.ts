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
vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof import('fs')>();
    return { ...actual, createWriteStream: () => runtime.stream };
});
vi.mock('../../electron/services/logger.service', () => ({ logger: runtime.logger }));

import { readFileSync } from 'fs';
import path from 'path';
import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';
import { SigaaService } from '../../electron/services/sigaa.service';
import { PORTAL_ADAPTER_VERSION, extractCourseList, validateCourseListDocument } from '../../electron/sigaa/portal-adapter';

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
function scraper() {
    const service = new HttpScraperService();
    service.setCookies([{ name: 'JSESSIONID', value: 'fixture-cookie', domain: 'si3.ufc.br' }]);
    return service;
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

    it('distinguishes an expired entry page from a recognized student portal', () => {
        expect(validateCourseListDocument(loginHtml)).toMatchObject({ code: 'SESSION_EXPIRED' });
        expect(validateCourseListDocument(portalHtml)).toBeNull();
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

describe('PORTAL-013: course list extraction is a pure adapter function', () => {
    const fixture = (name: string) =>
        readFileSync(path.join(process.cwd(), 'tests/fixtures/sigaa', PORTAL_ADAPTER_VERSION, name), 'utf8');

    function row(id: string, cell: string) {
        return `<tr><td><input type="hidden" name="idTurma" value="${id}"></td><td>${cell}</td></tr>`;
    }
    function link(id: string, text: string) {
        return `<a id="formTurma:turmaVirtual${id}" href="#" onclick="jsfcljs(document.forms['formTurma'],'idTurma,${id}','');return false;">${text}</a>`;
    }
    const portal = (rows: string) => `<h1>Portal do Discente</h1><div id="turmas-portal"><form name="formTurma"><table>${rows}</table></form></div>`;

    it('reports drift when the semester panel is gone but the page still has course rows', () => {
        // Sem esta guarda o painel renomeado vira "zero turmas": o ramo do
        // PORTAL-010 devolveria NOT_FOUND ("problema de sessão"), sem
        // diagnóstico estrutural e sem armar o kill-switch do PORTAL-008 —
        // justamente a mudança de layout que ele existe para pegar.
        const renamed = portal(row('1', link('1', 'CK0001 - Course One')))
            .replace('id="turmas-portal"', 'id="portal-turmas"');

        const result = extractCourseList(renamed);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('SELECTOR_DRIFT');
        expect(result.error.message).toContain('#turmas-portal');
    });

    it('treats a page with no course rows at all as an empty list, not drift', () => {
        expect(extractCourseList('<h1>Portal do Discente</h1><div class="nome_usuario">Aluno</div>'))
            .toMatchObject({ success: true, courses: [] });
    });

    it('ignores enabled classrooms outside the semester panels, including duplicate panel ids', () => {
        const result = extractCourseList(portal(row('1', link('1', 'CK0001 - Course One'))) +
            '<div id="turmas-portal"></div><div id="turmas-habilitadas"><table>' +
            row('2', '<a id="form:turmasVirtuaisHabilitadas">2026.1 - Other Course</a>') + '</table></div>');
        expect(result).toMatchObject({ success: true, courses: [{ id: '1' }],
            selectorCounts: { courseIdInputs: 1, virtualClassroomLinks: 1 } });
    });

    it('counts the nearest course row only inside nested layout tables', () => {
        const result = extractCourseList(portal('<tr><td><table>' +
            row('1', link('1', 'CK0001 - Course One')) + '</table></td></tr>'));
        expect(result).toMatchObject({ success: true, courses: [{ id: '1' }] });
    });

    it('uses the first rendered schedule line when HTML has br without source newlines', () => {
        const result = extractCourseList(portal('<tr><td><input name="idTurma" value="1">' +
            link('1', 'CK0001 - Course One') + '</td><td class="info"><center>SEG 08:00-10:00<br>QUA 08:00-10:00<br>(datas)</center></td></tr>'));
        expect(result).toMatchObject({ success: true, courses: [{ period: 'SEG 08:00-10:00' }] });
    });

    it.each(['', ' value=""', ' value="   "'])('rejects an unusable course id: %s', (value) => {
        const result = extractCourseList(portal('<tr><td><input name="idTurma"' + value + '>' +
            link('1', 'CK0001 - Course One') + '</td></tr>'));
        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('SELECTOR_DRIFT');
        expect(result.error.message).toContain('1 de 1');
    });

    it('extracts every course of the realistic populated fixture with id, code, name and period filled', () => {
        const result = extractCourseList(fixture('student-portal-populated.html'));

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.courses).toHaveLength(3);
        expect(result.degraded).toBe(0);
        for (const course of result.courses) {
            expect(course.id).toMatch(/^\d+$/);
            expect(course.code).toMatch(/^[A-Z]{2}\d{4}$/);
            expect(course.name.length).toBeGreaterThan(0);
            expect(course.period).toBe('SEG 08:00-10:00');
            expect(course.onclick).toContain('jsfcljs');
        }
        expect(result.courses[0]).toMatchObject({ id: '99991', code: 'CB0001', name: 'Cálculo I' });
        // Only the first ` - ` splits: the rest of the text stays in the name.
        expect(result.courses[2]).toMatchObject({ code: 'CK0181', name: 'Programação Orientada a Objetos - Turma B' });
    });

    it('keeps a candidate without the " - " separator as a course with empty code and the whole text as name (degradation, not loss)', () => {
        const result = extractCourseList(portal(
            row('1', link('1', 'CK0001 - Course One')) +
            row('2', link('2', 'CK0002 – Course Two'))
        ));

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.courses).toHaveLength(2);
        expect(result.degraded).toBe(1);
        expect(result.courses[0]).toMatchObject({ id: '1', code: 'CK0001', name: 'Course One' });
        expect(result.courses[1]).toMatchObject({ id: '2', code: '', name: 'CK0002 – Course Two' });
    });

    it('fails with SELECTOR_DRIFT when a candidate row has no virtual classroom link, naming how many rows were not interpreted', () => {
        const result = extractCourseList(portal(
            row('1', link('1', 'CK0001 - Course One')) +
            row('2', 'Course Two')
        ));

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('SELECTOR_DRIFT');
        expect(result.error.message).toContain('1 de 2');
        expect(result.selectorCounts).toEqual({ courseIdInputs: 2, virtualClassroomLinks: 1 });
    });

    it('fails with SELECTOR_DRIFT when a candidate row has a link with empty text', () => {
        const result = extractCourseList(portal(
            row('1', link('1', '   ')) +
            row('2', link('2', 'CK0002 - Course Two'))
        ));

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.code).toBe('SELECTOR_DRIFT');
        expect(result.error.message).toContain('1 de 2');
    });

    it('returns zero courses (not a failure) for a document with no candidate rows, leaving the classification to the caller', () => {
        const result = extractCourseList('<h1>Portal do Discente</h1><span class="nome_usuario">User</span>');

        expect(result).toMatchObject({ success: true, courses: [], degraded: 0, selectorCounts: { courseIdInputs: 0, virtualClassroomLinks: 0 } });
    });
});
