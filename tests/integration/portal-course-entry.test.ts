/**
 * Revisão do PORTAL-001: a linha "Entrar na turma" da matriz exige validar o
 * documento inicial (STUDENT_PORTAL) antes do clique, e a invalidação do estado
 * JSF vale para qualquer falha de atualização — inclusive a que sai por exceção.
 * Ambos os casos abaixo ficam vermelhos sem a correção do revisor.
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
        getPath: vi.fn(() => 'C:\tmp\sigaa-me-vitest')
    }
}));
vi.mock('../../electron/services/logger.service', () => ({ logger: runtime.logger }));
vi.mock('fs', () => ({
    createWriteStream: vi.fn(() => runtime.stream),
    promises: { writeFile: vi.fn() }
}));

import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';
import { failFromResult } from '../../shared/errors';

const LOGIN_DOCUMENT =
    '<form action="/sigaa/logar.do"><input name="user.login"><input name="user.senha"><input name="entrar" type="submit"></form>';
const PORTAL_DOCUMENT =
    '<a href="/sigaa/verPortalDiscente.do">Menu Discente</a><span class="nome_usuario">User</span>'
    + '<table><tr><input name="idTurma" value="999"><a id="form:turmaVirtual">Outra turma</a></tr></table>';
const COURSE_PAGE =
    '<html><form name="formAva" action="/sigaa/ava/index.jsf">'
    + '<input name="javax.faces.ViewState" value="state-antigo">'
    + '<input name="formAva" value="formAva">'
    + '</form></html>';

/**
 * Página que devolve o formulário de login sem que a URL deixe de ser a do
 * portal — é assim que a sessão do SIGAA cai no meio de um sync.
 */
function createEntryHarness() {
    let currentDocument = LOGIN_DOCUMENT;
    let evaluateCalls = 0;
    const locator: any = {
        first: vi.fn(() => locator),
        filter: vi.fn(() => locator),
        isVisible: vi.fn().mockResolvedValue(false),
        click: vi.fn().mockResolvedValue(undefined),
        textContent: vi.fn().mockResolvedValue('')
    };
    const page: any = {
        goto: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        click: vi.fn(async () => { currentDocument = PORTAL_DOCUMENT; }),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        url: vi.fn(() => 'https://si3.ufc.br/sigaa/paginaInicial.do'),
        $: vi.fn().mockResolvedValue(null),
        evaluate: vi.fn(async () => {
            evaluateCalls += 1;
            return evaluateCalls === 1
                ? { success: false }
                : { courseIds: [], pageTitle: 'SIGAA', bodyText: '' };
        }),
        content: vi.fn(async () => currentDocument),
        locator: vi.fn(() => locator),
        isClosed: vi.fn(() => false),
        on: vi.fn()
    };
    const context: any = {
        newPage: vi.fn().mockResolvedValue(page),
        cookies: vi.fn().mockResolvedValue([{ name: 'JSESSIONID', value: 'fresh', domain: 'si3.ufc.br' }]),
        addCookies: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined)
    };
    runtime.chromium.launch.mockResolvedValue({
        newContext: vi.fn().mockResolvedValue(context),
        close: vi.fn().mockResolvedValue(undefined)
    });
    return { page, setDocument: (html: string) => { currentDocument = html; } };
}

/** Sessão autenticada de verdade, para só então derrubar o documento do portal. */
async function authenticatedService() {
    const harness = createEntryHarness();
    const service = new PlaywrightLoginService();
    const login = await service.login('student', 'correct-password');
    expect(login.success).toBe(true);
    return { service, ...harness };
}

describe('PORTAL-001 — documento inicial da entrada de turma', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('trata o formulário de login servido na URL do portal como sessão expirada, não como turma ausente', async () => {
        const { service, page, setDocument } = await authenticatedService();
        setDocument(LOGIN_DOCUMENT);

        const result = await service.enterCourseAndGetHTML('123', 'Algorithms');

        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('SESSION_EXPIRED');
        expect(failFromResult(result).error.code).toBe('SESSION_EXPIRED');
        // Sem documento reconhecido não se clica em nada.
        expect(page.evaluate).not.toHaveBeenCalled();
    });

    it('mantém NOT_FOUND quando o portal é reconhecido e a turma pedida não está nele', async () => {
        const { service, setDocument } = await authenticatedService();
        setDocument(PORTAL_DOCUMENT);

        const result = await service.enterCourseAndGetHTML('123', 'Algorithms');

        expect(result.success).toBe(false);
        expect(failFromResult(result).error.code).toBe('NOT_FOUND');
    });
});

describe('PORTAL-001 — invalidação do estado JSF quando a atualização lança', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('não reaproveita o ViewState anterior depois de a atualização da turma falhar por exceção', async () => {
        const scraper = new HttpScraperService();
        scraper.setCookies([{ name: 'JSESSIONID', value: 'valid', domain: 'si3.ufc.br' }]);

        const first = await scraper.getCourseFiles('123', 'Algorithms', COURSE_PAGE);
        expect(first.success).toBe(true);

        runtime.axios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));
        const refresh = await scraper.getCourseFiles('123', 'Algorithms');
        expect(refresh.success).toBe(false);

        const download = await scraper.downloadFile(
            '123',
            'file-1',
            'aula.pdf',
            'C:\tmp\destino',
            "jsfcljs(document.forms['formAva'],'formAva:file,id,file-1','');"
        );

        expect(download.success).toBe(false);
        expect(runtime.axios.post).not.toHaveBeenCalled();
    });
});
