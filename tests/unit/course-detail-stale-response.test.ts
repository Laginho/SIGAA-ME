// @vitest-environment jsdom
/**
 * BUG-022: uma resposta assíncrona de uma disciplina/notícia abandonada não
 * pode sobrescrever a tela atual. Seam: `renderCourseDetailPage`, como os
 * outros testes de course-detail — importa a página real e controla só
 * `window.api`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readCoursesCache, setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { renderCourseDetailPage } from '../../src/pages/course-detail';
import { ok } from '../../shared/errors';

function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    setActiveAccount({ id: 'acc-test', name: 'ALUNO' });
});

describe('course-detail: navegação com "carregar notícias" pendente (BUG-022 achado 1)', () => {
    it('concluir o carregamento de c1 depois de c2 montada não altera a tela de c2, mas ainda atualiza o cache de c1', async () => {
        writeAccountItem('courses', JSON.stringify([
            { id: 'c1', name: 'Course One', code: 'C1', files: [], news: [] },
            { id: 'c2', name: 'Course Two', code: 'C2', files: [], news: [] },
        ]));

        let resolveLoadAllNews!: (value: unknown) => void;
        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ lastDownloadPath: 'C:/Users/aluno/SIGAA' }),
            checkFilesExistence: vi.fn().mockResolvedValue(ok([])),
            onDownloadProgress: vi.fn(() => () => undefined),
            loadAllNews: vi.fn(() => new Promise(resolve => { resolveLoadAllNews = resolve; })),
        };

        const container = document.createElement('div');
        document.body.appendChild(container);

        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        const loadAllNewsBtn = container.querySelector<HTMLButtonElement>('#loadAllNewsBtn');
        expect(loadAllNewsBtn).not.toBeNull();
        loadAllNewsBtn!.click();
        await flushAll();

        // Usuário volta ao dashboard e abre c2 antes de c1 terminar.
        renderCourseDetailPage(container, 'c2');
        for (let i = 0; i < 10; i++) await flushAll();

        expect(document.getElementById('courseTitle')?.textContent).toBe('Course Two');

        // A resposta de c1 chega agora.
        resolveLoadAllNews(ok([{ id: 'n1', title: 'Aviso', date: '01/01/2026', notification: '' }]));
        for (let i = 0; i < 10; i++) await flushAll();

        expect(document.getElementById('courseTitle')?.textContent).toBe('Course Two');

        const courses = readCoursesCache();
        const c1 = courses.find((c: any) => c.id === 'c1');
        expect(c1?.news).toHaveLength(1);
    });
});

describe('course-detail: fechar e reabrir o modal com pedido pendente (BUG-022 achado 2)', () => {
    it('resposta de n1 (fechada) não substitui o conteúdo de n2 (aberta), nem no sucesso nem no erro', async () => {
        writeAccountItem('courses', JSON.stringify([
            {
                id: 'c1', name: 'Cálculo I', code: 'CB0001', files: [],
                news: [
                    { id: 'n1', title: 'First', date: '01/01/2026', notification: '' },
                    { id: 'n2', title: 'Second', date: '02/02/2026', notification: '', content: 'Second content' },
                ],
            },
        ]));

        let resolveNewsDetail!: (value: unknown) => void;
        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ lastDownloadPath: 'C:/Users/aluno/SIGAA' }),
            checkFilesExistence: vi.fn().mockResolvedValue(ok([])),
            onDownloadProgress: vi.fn(() => () => undefined),
            getNewsDetail: vi.fn(() => new Promise(resolve => { resolveNewsDetail = resolve; })),
        };

        const container = document.createElement('div');
        document.body.appendChild(container);
        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        const items = container.querySelectorAll<HTMLButtonElement>('.news-item');
        expect(items).toHaveLength(2);

        // Abre n1 (sem cache) e fecha antes da resposta.
        items[0].click();
        await flushAll();
        document.querySelector<HTMLButtonElement>('#newsModal .modal-close')!.click();

        // Abre n2 (em cache) — sincrono, sem chamar a API.
        items[1].click();
        await flushAll();
        expect(document.getElementById('modalTitle')?.textContent).toBe('Second');

        // A resposta de n1 chega agora, com sucesso.
        resolveNewsDetail(ok({ title: 'First', date: '01/01/2026', notification: '', content: 'First content' }));
        for (let i = 0; i < 10; i++) await flushAll();

        expect(document.getElementById('modalTitle')?.textContent).toBe('Second');
        expect(document.getElementById('modalBody')?.textContent).toContain('Second content');

        const courses = readCoursesCache();
        const n1 = courses.find((c: any) => c.id === 'c1')?.news.find((n: any) => n.id === 'n1');
        expect(n1?.content).toBe('First content');
    });
});
