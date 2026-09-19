import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    enterCourseAndGetHTML: vi.fn(), getNewsDetail: vi.fn(), getCourseFiles: vi.fn(),
}));
vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => '/mock' } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));
vi.mock('../../electron/services/playwright-login.service', () => ({
    PlaywrightLoginService: class {
        enterCourseAndGetHTML = mocks.enterCourseAndGetHTML;
        getNewsDetail = mocks.getNewsDetail;
    },
}));
vi.mock('../../electron/services/http-scraper.service', () => ({
    HttpScraperService: class {
        getCourseFiles = mocks.getCourseFiles;
        setCookies = vi.fn();
    },
}));

import { SigaaService } from '../../electron/services/sigaa.service';

const news = ['N1', 'N2', 'N3'].map(id => ({ id, title: id, date: '19/09/2026', notification: 'Sim' }));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html/>', cookies: [] });
    mocks.getCourseFiles.mockResolvedValue({ success: true, files: [], news });
    mocks.getNewsDetail.mockImplementation(async (_courseId: string, _name: string, id: string) => ({
        success: true, news: { content: `Corpo ${id}` },
    }));
});

it('entrega todos os corpos quando todos os detalhes carregam', async () => {
    const result = await new SigaaService().loadAllNews('C1', 'Matemática');
    expect(result).toEqual({ success: true, data: news.map(item => ({ ...item, content: `Corpo ${item.id}` })) });
});

it('informa uma falha entre três notícias e continua buscando os outros corpos', async () => {
    mocks.getNewsDetail
        .mockResolvedValueOnce({ success: true, news: { content: 'Primeira' } })
        .mockResolvedValueOnce({ success: false, error: 'Navigation timeout' });
    const result = await new SigaaService().loadAllNews('C1', 'Matemática');
    expect(result).toEqual({ success: false, error: { code: 'PORTAL_UNAVAILABLE', message: '1 de 3 notícias sem conteúdo' } });
    expect(mocks.getNewsDetail.mock.calls.map(call => call[2])).toEqual(['N1', 'N2', 'N3']);
});

it('conta todas as falhas e preserva o código da primeira', async () => {
    mocks.getNewsDetail
        .mockResolvedValueOnce({ success: false, error: 'SIGAA selector drift: news body' })
        .mockResolvedValue({ success: false, error: 'Navigation timeout' });
    const result = await new SigaaService().loadAllNews('C1', 'Matemática');
    expect(result).toEqual({ success: false, error: { code: 'SELECTOR_DRIFT', message: '3 de 3 notícias sem conteúdo' } });
    expect(mocks.getNewsDetail).toHaveBeenCalledTimes(3);
});

it('cancelamento durante o último detalhe tem precedência sobre a falha do lote', async () => {
    mocks.getCourseFiles.mockResolvedValue({ success: true, files: [], news: [news[0]] });
    let finish!: (value: { success: false; error: string }) => void;
    mocks.getNewsDetail.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const service = new SigaaService();
    const load = service.loadAllNews('C1', 'Matemática');
    await new Promise(resolve => setImmediate(resolve));
    expect(mocks.getNewsDetail).toHaveBeenCalledTimes(1);
    const shutdown = service.operations.run('shutdown', async () => {});
    finish({ success: false, error: 'Navigation timeout' });
    const result = await load;
    await shutdown;
    expect(result).toMatchObject({ success: false, error: { code: 'CANCELLED' } });
});
