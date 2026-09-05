// @vitest-environment jsdom
/**
 * DATA-001 — isolamento entre contas no renderer, pelos módulos de produção.
 *
 * Os critérios de aceite da issue, um por teste: conta B não vê nada de A
 * (disciplinas, corpo de notícia, notificações, lidos, downloads, foto); A
 * volta e reencontra só o que é dela; dado legado sem escopo nunca aparece
 * depois de outra pessoa logar; evento de sync em background de outra conta
 * é rejeitado.
 *
 * Tudo aqui passa pelos escritores reais — `mergeCoursesIntoCache`,
 * `pushNotifications`, `markAsRead`, `renderDashboardPage`,
 * `handleBackgroundSyncUpdate` — nunca por `localStorage.setItem` de chave da
 * aplicação. Só as chaves legadas são plantadas cruas, porque é assim que elas
 * existem no disco de quem já usa o app.
 *
 * Vermelho hoje pelo motivo certo: `src/data/account-storage.ts` não existe.
 *
 * Contrato e decisões: `.scratch/04-fase3-fronteiras-de-confianca/issues/05-DATA-001-*.md`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/toast';
import { accountKey, readAccountItem, setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { handleBackgroundSyncUpdate, renderDashboardPage } from '../../src/pages/dashboard';
import {
    courseHasUnread,
    getAllNotifications,
    getUnreadCount,
    isItemRead,
    markAsRead,
    pushNotifications,
} from '../../src/utils/notification-store';
import { isNewsCached, mergeCoursesIntoCache } from '../../src/utils/ui-helpers';

const A = { id: 'acc-a', name: 'ALUNO A' };
const A_PHOTO = 'https://si3.ufc.br/sigaa/verFoto?id=a';
const B = { id: 'acc-b', name: 'ALUNO B' };

const COURSE_A = {
    id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1', fileCount: 1,
    files: [{ id: '555', name: 'Lista 1.pdf', type: 'file' }],
    news: [{ id: 'n1', title: 'Prova adiada', date: '01/09/2026', notification: '', content: '<p>Prova dia 10.</p>' }],
};

const FILE_NOTIFICATION = {
    id: 'file-c1-Lista 1.pdf', type: 'file' as const, courseId: 'c1', courseName: 'Estruturas de Dados',
    itemId: 'Lista 1.pdf', itemTitle: 'Lista 1.pdf', timestamp: 1, read: false,
};

function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function coursesOf(): string[] {
    const raw = readAccountItem('courses');
    return raw ? JSON.parse(raw).map((c: { id: string }) => c.id) : [];
}

/** Popula a conta A exatamente como o app faz: sync, notificação, leitura, download, foto. */
function seedAccountA() {
    setActiveAccount(A);
    mergeCoursesIntoCache([structuredClone(COURSE_A)], { replaceSet: true }, 1_000);
    pushNotifications([{ ...FILE_NOTIFICATION }]);
    markAsRead('news', 'c1', 'n1');
    writeAccountItem('downloads', JSON.stringify({ c1: { 'Lista 1.pdf': { downloadedAt: 1, path: 'C:/Users/a/SIGAA/Lista 1.pdf' } } }));
    writeAccountItem('photo', A_PHOTO);
}

function mountDashboard(account: { id: string; name: string; photoUrl?: string }) {
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderDashboardPage(app, account);
    return app;
}

describe('account isolation (renderer)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
            onBackgroundSyncUpdate: vi.fn(() => () => undefined),
            logout: vi.fn().mockResolvedValue({ success: true }),
            clearAllData: vi.fn().mockResolvedValue({ success: true }),
        };
    });

    it('sanity: account A sees its own data through the production readers', () => {
        seedAccountA();

        expect(coursesOf()).toEqual(['c1']);
        expect(isNewsCached('c1', 'n1')).toBe(true);
        expect(isItemRead('news', 'c1', 'n1')).toBe(true);
        expect(getUnreadCount()).toBe(1);
        expect(courseHasUnread('c1')).toBe(true);
        expect(readAccountItem('downloads')).toContain('Lista 1.pdf');
        expect(readAccountItem('photo')).toBe(A_PHOTO);
    });

    it('account B cannot view account A courses, news, notifications, read state, download history or photo', () => {
        seedAccountA();

        setActiveAccount(B);

        expect(coursesOf()).toEqual([]);
        expect(isNewsCached('c1', 'n1')).toBe(false);
        expect(getAllNotifications()).toEqual([]);
        expect(getUnreadCount()).toBe(0);
        expect(courseHasUnread('c1')).toBe(false);
        expect(isItemRead('news', 'c1', 'n1')).toBe(false);
        expect(readAccountItem('downloads')).toBeNull();
        expect(readAccountItem('photo')).toBeNull();
    });

    it('every key the app wrote is namespaced — nothing unscoped is left for the next account to find', () => {
        seedAccountA();

        const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!);
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.every(k => k.startsWith(`sigaa-me:v2:${A.id}:`))).toBe(true);
    });

    it('returning to account A reuses only account A namespaced cache', () => {
        seedAccountA();
        setActiveAccount(B);
        mergeCoursesIntoCache([{ id: 'c9', name: 'Física', code: 'CF1', period: '2026.1', files: [], news: [], fileCount: 0 }], { replaceSet: true }, 2_000);
        pushNotifications([{ ...FILE_NOTIFICATION, id: 'file-c9-x.pdf', courseId: 'c9', itemId: 'x.pdf', itemTitle: 'x.pdf' }]);

        setActiveAccount(A);

        expect(coursesOf()).toEqual(['c1']);
        expect(isNewsCached('c1', 'n1')).toBe(true);
        expect(readAccountItem('sync-timestamp')).toBe('1000');
        expect(getAllNotifications().map(n => n.id)).toEqual([FILE_NOTIFICATION.id]);
        expect(isItemRead('news', 'c1', 'n1')).toBe(true);
        expect(readAccountItem('photo')).toBe(A_PHOTO);
    });

    it('the dashboard photo fallback is per account: A gets its stored photo, B gets the placeholder', async () => {
        seedAccountA();
        const appA = mountDashboard(A); // sem photoUrl no perfil: cai no fallback armazenado
        await flushAll();
        const photoA = appA.querySelector<HTMLImageElement>('img.user-photo');
        expect(photoA?.src).toBe(A_PHOTO);

        document.body.innerHTML = '';
        setActiveAccount(B);
        const appB = mountDashboard(B);
        await flushAll();

        expect(appB.querySelector('img.user-photo')).toBeNull();
        expect(appB.querySelector('.user-photo-placeholder')?.textContent).toBe('A');
    });

    it('legacy unscoped data cannot appear after another user logs in', async () => {
        localStorage.setItem('coursesWithFiles', JSON.stringify([structuredClone(COURSE_A)]));
        localStorage.setItem('cacheTimestamp', '1');
        localStorage.setItem('downloadedFiles', JSON.stringify({ c1: { 'Lista 1.pdf': { path: 'x' } } }));
        localStorage.setItem('readItems', JSON.stringify(['news-c1-n1']));
        localStorage.setItem('notificationsHistory', JSON.stringify([FILE_NOTIFICATION]));
        localStorage.setItem('userPhotoUrl', A_PHOTO);

        setActiveAccount(B);
        const app = mountDashboard(B);
        await flushAll();

        expect(coursesOf()).toEqual([]);
        expect(getAllNotifications()).toEqual([]);
        expect(isItemRead('news', 'c1', 'n1')).toBe(false);
        expect(app.querySelector('img.user-photo')).toBeNull();
        expect(app.textContent).not.toContain('Estruturas de Dados');
        expect(localStorage.getItem('coursesWithFiles')).toBeNull();
        expect(localStorage.getItem('userPhotoUrl')).toBeNull();
    });
});

describe('background sync updates are bound to an account', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
            onBackgroundSyncUpdate: vi.fn(() => () => undefined),
        };
    });

    const UPDATE_COURSE = { id: 'c9', name: 'Física', code: 'CF1', period: '2026.1', files: [], news: [], fileCount: 0 };
    const UPDATE_NOTIFICATION = { ...FILE_NOTIFICATION, id: 'file-c9-x.pdf', courseId: 'c9', itemId: 'x.pdf', itemTitle: 'x.pdf' };

    it('accepts an update tagged with the active account (positive control)', () => {
        seedAccountA();
        const info = vi.spyOn(toast, 'info');

        handleBackgroundSyncUpdate({ accountId: A.id, courses: [UPDATE_COURSE], notifications: [UPDATE_NOTIFICATION], timestamp: 5_000 } as any);

        expect(coursesOf()).toEqual(['c9']);
        expect(getAllNotifications().map(n => n.id)).toContain(UPDATE_NOTIFICATION.id);
        expect(info).toHaveBeenCalled();
    });

    it('rejects an update tagged with another account: no cache write, no notification, no toast', () => {
        seedAccountA();
        const info = vi.spyOn(toast, 'info');
        const error = vi.spyOn(toast, 'error');

        handleBackgroundSyncUpdate({ accountId: B.id, courses: [UPDATE_COURSE], notifications: [UPDATE_NOTIFICATION], timestamp: 5_000 } as any);

        expect(coursesOf()).toEqual(['c1']);
        expect(readAccountItem('sync-timestamp')).toBe('1000');
        expect(getAllNotifications().map(n => n.id)).toEqual([FILE_NOTIFICATION.id]);
        expect(localStorage.getItem(accountKey(B.id, 'courses'))).toBeNull();
        expect(info).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it('rejects an update with no account id at all', () => {
        seedAccountA();

        handleBackgroundSyncUpdate({ courses: [UPDATE_COURSE], notifications: [UPDATE_NOTIFICATION], timestamp: 5_000 } as any);

        expect(coursesOf()).toEqual(['c1']);
        expect(getAllNotifications().map(n => n.id)).toEqual([FILE_NOTIFICATION.id]);
    });

    it('rejects any update when nobody is logged in', () => {
        handleBackgroundSyncUpdate({ accountId: A.id, courses: [UPDATE_COURSE], notifications: [UPDATE_NOTIFICATION], timestamp: 5_000 } as any);

        expect(localStorage.length).toBe(0);
    });
});
