// @vitest-environment jsdom
/**
 * A11Y-001 — course-detail: nome acessível no botão de fechar do modal e no
 * botão de download por arquivo, item de notícia como controle semântico, e
 * modal de notícia migrado para `<dialog>` nativo (Escape, focus trap e
 * inertness do fundo vêm de graça do navegador — cobertos em
 * tests/e2e/accessibility.spec.ts, que roda num browser de verdade).
 *
 * Seam: `renderCourseDetailPage`, como o teste existente de course-detail.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { renderCourseDetailPage } from '../../src/pages/course-detail';
import { ok } from '../../shared/errors';

function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

const COURSE = {
    id: 'c1',
    name: 'Cálculo I',
    code: 'CB0001',
    files: [{ name: 'Lista 3.pdf', type: 'file', id: '555' }],
    news: [{ id: 'n1', title: 'Prova adiada', date: '01/01/2026', notification: '' }],
};

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    setActiveAccount({ id: 'acc-test', name: 'ALUNO' });
    writeAccountItem('courses', JSON.stringify([COURSE]));
    (window as any).api = {
        getSettings: vi.fn().mockResolvedValue({ lastDownloadPath: 'C:/Users/aluno/SIGAA' }),
        checkFilesExistence: vi.fn().mockResolvedValue(ok([])),
        onDownloadProgress: vi.fn(() => () => undefined),
        getNewsDetail: vi.fn().mockResolvedValue(ok({ title: 'Prova adiada', date: '01/01/2026', notification: '', content: '<p>ok</p>' })),
    };
});

async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCourseDetailPage(container, 'c1');
    for (let i = 0; i < 10; i++) await flushAll();
    return container;
}

describe('course-detail: controles só-ícone têm nome acessível', () => {
    it('o botão de fechar do modal tem aria-label', async () => {
        await mount();
        const closeBtn = document.querySelector('#newsModal .modal-close');
        expect(closeBtn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('o botão de download de um arquivo referencia o nome do arquivo no aria-label', async () => {
        const container = await mount();
        const btn = container.querySelector('.btn-download-file');
        expect(btn?.getAttribute('aria-label')).toBe('Baixar Lista 3.pdf');
    });
});

describe('course-detail: item de notícia é um controle semântico', () => {
    it('renderiza como <button type="button">, não uma div com só onClick', async () => {
        const container = await mount();
        const item = container.querySelector('.news-item');
        expect(item?.tagName).toBe('BUTTON');
        expect((item as HTMLButtonElement).type).toBe('button');
    });
});

describe('course-detail: modal de notícia é um <dialog> nativo', () => {
    // `tests/setup.ts` faz polyfill de `showModal()`/`close()` (jsdom 29 não
    // implementa nenhum dos dois) manipulando só o atributo `open` — o
    // suficiente para provar que o código chama a API certa. Escape, focus
    // trap e restauração de foco são comportamento do browser real, não do
    // polyfill: ver tests/e2e/accessibility.spec.ts.
    it('o elemento #newsModal é um HTMLDialogElement, rotulado pelo título da notícia', async () => {
        await mount();
        const modal = document.getElementById('newsModal');
        expect(modal?.tagName).toBe('DIALOG');
        expect(modal?.getAttribute('aria-labelledby')).toBe('modalTitle');
    });

    it('clicar num item de notícia abre o dialog (modal.open === true)', async () => {
        const container = await mount();
        const item = container.querySelector<HTMLButtonElement>('.news-item')!;
        item.click();
        await flushAll();
        const modal = document.getElementById('newsModal') as HTMLDialogElement;
        expect(modal.open).toBe(true);
    });

    it('clicar em fechar fecha o dialog (modal.open === false)', async () => {
        const container = await mount();
        const item = container.querySelector<HTMLButtonElement>('.news-item')!;
        item.click();
        await flushAll();
        const modal = document.getElementById('newsModal') as HTMLDialogElement;
        expect(modal.open).toBe(true);

        document.querySelector<HTMLButtonElement>('#newsModal .modal-close')!.click();
        expect(modal.open).toBe(false);
    });

    it('não acumula listener de clique no fundo a cada abertura (reabrir não fecha em dobro)', async () => {
        // `openNewsModal` registra um listener de clique no `<dialog>` a cada
        // chamada e nunca o remove — diferente do botão de fechar, que usa
        // `{ once: true }`. Reabrir o modal várias vezes empilha um listener
        // por abertura; um único clique no fundo então dispara `close()` uma
        // vez por listener ainda pendurado.
        const container = await mount();
        const modal = document.getElementById('newsModal') as HTMLDialogElement;
        const closeSpy = vi.spyOn(modal, 'close');
        const item = container.querySelector<HTMLButtonElement>('.news-item')!;

        item.click();
        await flushAll();
        document.querySelector<HTMLButtonElement>('#newsModal .modal-close')!.click();
        expect(closeSpy).toHaveBeenCalledTimes(1);

        item.click();
        await flushAll();
        modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(closeSpy).toHaveBeenCalledTimes(2);
    });
});

describe('course-detail: nome acessível do modal antes do conteúdo carregar', () => {
    it('o alvo de aria-labelledby existe e tem texto durante o carregamento', async () => {
        const container = await mount();
        const item = container.querySelector<HTMLButtonElement>('.news-item')!;
        item.click();
        // Sem `await flushAll()`: o item não está em cache (fixture não tem
        // `content`), então o dialog abre em estado de carregamento aqui.
        const modal = document.getElementById('newsModal') as HTMLDialogElement;
        expect(modal.open).toBe(true);
        const labelledBy = modal.getAttribute('aria-labelledby');
        const label = labelledBy && document.getElementById(labelledBy);
        expect(label?.textContent).toBeTruthy();
    });

    it('o alvo de aria-labelledby continua existindo e com texto quando a busca falha', async () => {
        (window as any).api.getNewsDetail = vi.fn().mockResolvedValue({
            success: false,
            error: { message: 'falhou' },
        });
        const container = await mount();
        const item = container.querySelector<HTMLButtonElement>('.news-item')!;
        item.click();
        await flushAll();
        const modal = document.getElementById('newsModal') as HTMLDialogElement;
        const labelledBy = modal.getAttribute('aria-labelledby');
        const label = labelledBy && document.getElementById(labelledBy);
        expect(label?.textContent).toBeTruthy();
    });
});
