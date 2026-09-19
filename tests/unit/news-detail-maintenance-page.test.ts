// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ saveRaw: vi.fn() }));
vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => '/mock' } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('../../electron/services/diagnostics.service', () => ({
    diagnosticsService: { saveRaw: mocks.saveRaw, record: vi.fn() },
    buildStructuralDiagnostic: vi.fn(),
}));

import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';

const TITULO_TEXTO_FIXTURE = `
    <div id="conteudo">
        <table>
            <tr><th>Título:</th><td>Aviso importante</td></tr>
            <tr><th>Data:</th><td>19/09/2026</td></tr>
            <tr><th>Texto:</th><td>Conteúdo real da notícia.</td></tr>
        </table>
    </div>
`;

const MAINTENANCE_FIXTURE = `
    <div id="conteudo"><div>Sistema temporariamente indisponível para manutenção. Tente novamente mais tarde.</div></div>
`;

const TITLE_ONLY_FIXTURE = `
    <div id="conteudo">
        <table><tr><th>Título:</th><td>Aviso sem corpo</td></tr></table>
    </div>
`;

const EXPIRED_SESSION_FIXTURE = `
    <div id="conteudo">
        <form>
            <label>Usuário:</label><input type="text" name="user.login" />
            <label>Senha:</label><input type="password" name="user.senha" />
            <input type="submit" value="Entrar" />
        </form>
    </div>
`;

function fakePage(fixtureHtml: string) {
    const link = { click: vi.fn().mockResolvedValue(undefined) };
    const form = { $: vi.fn().mockResolvedValue(link) };
    return {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        isClosed: () => false,
        $: vi.fn().mockResolvedValue(form),
        waitForLoadState: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue(`<html><body>${fixtureHtml}</body></html>`),
        evaluate: vi.fn().mockImplementation(async (fn: () => unknown) => {
            document.body.innerHTML = fixtureHtml;
            return fn();
        }),
    };
}

function withFakePage(fixtureHtml: string) {
    const service = new PlaywrightLoginService();
    const page = fakePage(fixtureHtml);
    (service as any).browser = {};
    (service as any).context = {};
    (service as any).page = page;
    return service;
}

beforeEach(() => {
    vi.clearAllMocks();
});

it('devolve sucesso quando a página tem tabela Título/Texto', async () => {
    const service = withFakePage(TITULO_TEXTO_FIXTURE);
    const result = await service.getNewsDetail('C1', 'Matemática', 'N1');
    expect(result.success).toBe(true);
    expect(result.news?.title).toBe('Aviso importante');
    expect(result.news?.content).toContain('Conteúdo real da notícia.');
});

it('rejeita a página de manutenção em vez de gravar o aviso como notícia', async () => {
    const service = withFakePage(MAINTENANCE_FIXTURE);
    const result = await service.getNewsDetail('C1', 'Matemática', 'N2');
    expect(result.success).toBe(false);
    expect((result as any).news).toBeUndefined();
    expect(mocks.saveRaw).toHaveBeenCalled();
});

it('rejeita título sem corpo reconhecível, com mensagem distinta da manutenção', async () => {
    const maintenance = withFakePage(MAINTENANCE_FIXTURE);
    const maintenanceResult = await maintenance.getNewsDetail('C1', 'Matemática', 'N2');

    const service = withFakePage(TITLE_ONLY_FIXTURE);
    const result = await service.getNewsDetail('C1', 'Matemática', 'N3');
    expect(result.success).toBe(false);
    expect(result.error).not.toBe(maintenanceResult.error);
});

it('rejeita a página de sessão expirada (formulário de login)', async () => {
    const service = withFakePage(EXPIRED_SESSION_FIXTURE);
    const result = await service.getNewsDetail('C1', 'Matemática', 'N4');
    expect(result.success).toBe(false);
});
