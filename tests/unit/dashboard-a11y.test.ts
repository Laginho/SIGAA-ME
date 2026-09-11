// @vitest-environment jsdom
/**
 * A11Y-001 — dashboard: nome acessível nos controles só-ícone, cartão de
 * disciplina e item de notificação como links semânticos, e
 * aria-expanded/aria-controls no menu de notificação.
 *
 * Seam: `renderDashboardPage`, como os demais testes de dashboard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { renderDashboardPage } from '../../src/pages/dashboard';
import { pushNotifications } from '../../src/utils/notification-store';

const ACCOUNT = { id: 'acc-a11y', name: 'ALUNO A11Y' };
const COURSE = { id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1', fileCount: 1, files: [], news: [] };

function mount() {
    document.body.innerHTML = '';
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderDashboardPage(app, { ...ACCOUNT });
    return app;
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    setActiveAccount(ACCOUNT);
    writeAccountItem('courses', JSON.stringify([COURSE]));
    Object.defineProperty(window, 'api', {
        configurable: true,
        writable: true,
        value: {
            getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
            onBackgroundSyncUpdate: vi.fn(() => () => undefined),
        },
    });
});

describe('dashboard: controles só-ícone têm nome acessível', () => {
    it.each([
        ['notificationBellBtn', 'Notificações'],
        ['refreshBtn', 'Sincronizar'],
        ['settingsBtn', 'Configurações'],
        ['clearDataBtn', 'Limpar todos os dados locais'],
    ])('%s tem aria-label', (id, label) => {
        mount();
        expect(document.getElementById(id)?.getAttribute('aria-label')).toBe(label);
    });
});

describe('dashboard: menu de notificação', () => {
    it('o sino referencia o painel via aria-controls e começa fechado (aria-expanded=false)', () => {
        mount();
        const bell = document.getElementById('notificationBellBtn')!;
        expect(bell.getAttribute('aria-controls')).toBe('notificationDropdown');
        expect(bell.getAttribute('aria-expanded')).toBe('false');
    });

    it('clicar no sino abre o painel e vira aria-expanded=true; clicar de novo fecha', () => {
        mount();
        const bell = document.getElementById('notificationBellBtn')!;
        bell.click();
        expect(bell.getAttribute('aria-expanded')).toBe('true');
        bell.click();
        expect(bell.getAttribute('aria-expanded')).toBe('false');
    });

    it('clicar fora do painel fecha e aria-expanded volta a false', () => {
        mount();
        const bell = document.getElementById('notificationBellBtn')!;
        bell.click();
        expect(bell.getAttribute('aria-expanded')).toBe('true');
        document.body.click();
        expect(bell.getAttribute('aria-expanded')).toBe('false');
    });

    it('clicar num item de notificação fecha o painel e aria-expanded volta a false', () => {
        pushNotifications([{ id: 'n1', type: 'news', courseId: 'c1', courseName: 'Estruturas de Dados', itemId: 'x', itemTitle: 'Aviso', timestamp: 1, read: false }]);
        mount();
        const bell = document.getElementById('notificationBellBtn')!;
        bell.click();
        expect(bell.getAttribute('aria-expanded')).toBe('true');
        const item = document.querySelector('.notification-item') as HTMLElement;
        item.click();
        expect(bell.getAttribute('aria-expanded')).toBe('false');
    });
});

describe('dashboard: cartão de disciplina é um link semântico', () => {
    it('renderiza como <a href="#/course/<id>">, não uma div com onClick', () => {
        const app = mount();
        const card = app.querySelector('.course-card');
        expect(card?.tagName).toBe('A');
        expect(card?.getAttribute('href')).toBe('#/course/c1');
    });
});

describe('dashboard: item de notificação é um link semântico', () => {
    it('renderiza como <a href="#/course/<id>"> dentro do painel', () => {
        pushNotifications([{ id: 'n1', type: 'news', courseId: 'c1', courseName: 'Estruturas de Dados', itemId: 'x', itemTitle: 'Aviso', timestamp: 1, read: false }]);
        mount();
        document.getElementById('notificationBellBtn')!.click();
        const item = document.querySelector('.notification-item');
        expect(item?.tagName).toBe('A');
        expect(item?.getAttribute('href')).toBe('#/course/c1');
    });
});
