// @vitest-environment jsdom
/**
 * DATA-002 — o lado do renderer das duas transações, pelo dashboard de produção.
 *
 * Três coisas: (1) o dashboard mantém **um** listener de sync por vez — hoje
 * cada montagem soma um, e um evento é mesclado e "toastado" N vezes; (2) o
 * botão "Sair" lê o resultado do main e, com ou sem erro, encerra a sessão
 * desta janela sem apagar o cache da conta; (3) o 🗑️ pede ao main com **um**
 * clique (a confirmação é o dialog nativo do main, decisão 2 da issue) e reage
 * ao código de erro: `CANCELLED` não muda nada, `STORAGE` mostra a instrução
 * de recuperação e ainda assim limpa o storage local e volta ao login.
 *
 * `window.api` é um stub que guarda os callbacks inscritos e devolve um
 * `unsubscribe` espião, como o preload real. Tudo o mais é código de produção:
 * `renderDashboardPage`, `account-storage`, `notification-store`, `toast`.
 *
 * Vermelho hoje pelo motivo certo: duas montagens deixam dois listeners; o
 * 🗑️ exige dois cliques e ignora o resultado; "Sair" ignora o resultado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/toast';
import { accountKey, getActiveAccount, readAccountItem, setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { renderDashboardPage } from '../../src/pages/dashboard';
import type { BackgroundSyncUpdate, RendererApi } from '../../shared/ipc';
import { fail, ok } from '../../shared/errors';

const A = { id: 'acc-a', name: 'ALUNO A' };
const COURSE = { id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1', fileCount: 0, files: [], news: [] };
const UPDATE: BackgroundSyncUpdate = {
    accountId: A.id,
    courses: [{ id: 'c9', name: 'Física', code: 'CF1', period: '2026.1', fileCount: 0, files: [], news: [] }],
    notifications: [{ id: 'file-c9-x.pdf', type: 'file', courseId: 'c9', courseName: 'Física', itemId: 'x.pdf', itemTitle: 'x.pdf', timestamp: 1, read: false }],
    timestamp: 5_000,
};

type SyncListener = (data: BackgroundSyncUpdate) => void;

function installApi(overrides: Partial<RendererApi> = {}) {
    const listeners: SyncListener[] = [];
    const unsubscribers: ReturnType<typeof vi.fn>[] = [];
    const api = {
        getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
        onBackgroundSyncUpdate: vi.fn((cb: SyncListener) => {
            listeners.push(cb);
            const off = vi.fn(() => {
                const i = listeners.indexOf(cb);
                if (i >= 0) listeners.splice(i, 1);
            });
            unsubscribers.push(off);
            return off;
        }),
        logout: vi.fn().mockResolvedValue(ok()),
        clearAllData: vi.fn().mockResolvedValue(ok()),
        ...overrides,
    };
    Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
    return { api, listeners, unsubscribers };
}

function seedAccountA() {
    setActiveAccount(A);
    writeAccountItem('courses', JSON.stringify([COURSE]));
    writeAccountItem('sync-timestamp', '1000');
}

function mount() {
    const app = document.createElement('div');
    document.body.replaceChildren(app);
    renderDashboardPage(app, { ...A });
    return app;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const coursesOf = () => JSON.parse(readAccountItem('courses') ?? '[]').map((c: { id: string }) => c.id);

describe('dashboard: one live sync listener', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        seedAccountA();
    });

    it('mounting twice leaves exactly one live listener, and one update is merged and toasted once', () => {
        const { listeners, unsubscribers } = installApi();
        const info = vi.spyOn(toast, 'info');

        mount();
        mount();

        expect(listeners).toHaveLength(1);
        expect(unsubscribers[0]).toHaveBeenCalledTimes(1);

        listeners[0](UPDATE);

        expect(coursesOf()).toEqual(['c9']);
        expect(info).toHaveBeenCalledTimes(1);
    });
});

describe('dashboard: "Sair"', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        seedAccountA();
        window.location.hash = '#/dashboard';
    });

    it('asks main to log out, drops the listener and the window session, keeps the account cache', async () => {
        const { api, listeners } = installApi();
        mount();

        document.getElementById('logoutBtn')!.click();
        await flush();

        expect(api.logout).toHaveBeenCalledTimes(1);
        expect(listeners).toHaveLength(0);
        expect(getActiveAccount()).toBeNull();
        expect(localStorage.getItem(accountKey(A.id, 'courses'))).not.toBeNull();
        expect(window.location.hash).toBe('#/login');
    });

    it('a STORAGE failure from main is shown, and the window still leaves the session', async () => {
        const message = 'Não foi possível apagar a credencial salva: EPERM';
        installApi({ logout: vi.fn().mockResolvedValue(fail('STORAGE', message)) });
        const error = vi.spyOn(toast, 'error');
        mount();

        document.getElementById('logoutBtn')!.click();
        await flush();

        expect(error).toHaveBeenCalledWith(message);
        expect(getActiveAccount()).toBeNull();
        expect(window.location.hash).toBe('#/login');
    });
});

describe('dashboard: 🗑️ clear-all', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        vi.restoreAllMocks();
        seedAccountA();
        window.location.hash = '#/dashboard';
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('a single click asks main; on success every namespace and the session are gone and the window returns to login', async () => {
        const { api, listeners } = installApi();
        const success = vi.spyOn(toast, 'success');
        mount();
        expect(localStorage.length).toBeGreaterThan(0);

        document.getElementById('clearDataBtn')!.click();
        await vi.advanceTimersByTimeAsync(0);

        // Um clique: a confirmação é o dialog do main, não um segundo clique aqui.
        expect(api.clearAllData).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2_000);

        expect(listeners).toHaveLength(0);
        expect(localStorage.length).toBe(0);
        expect(getActiveAccount()).toBeNull();
        expect(success).toHaveBeenCalled();
        expect(window.location.hash).toBe('#/login');
    });

    it('CANCELLED leaves everything in place: storage, session, page — and shows no error', async () => {
        const { api, listeners } = installApi({ clearAllData: vi.fn().mockResolvedValue(fail('CANCELLED', 'Limpeza cancelada.')) });
        const error = vi.spyOn(toast, 'error');
        const success = vi.spyOn(toast, 'success');
        mount();

        document.getElementById('clearDataBtn')!.click();
        await vi.advanceTimersByTimeAsync(2_000);

        // O main foi perguntado (é lá que o dialog vive) e disse não.
        expect(api.clearAllData).toHaveBeenCalledTimes(1);
        expect(coursesOf()).toEqual(['c1']);
        expect(getActiveAccount()?.id).toBe(A.id);
        expect(listeners).toHaveLength(1);
        expect(window.location.hash).toBe('#/dashboard');
        expect(error).not.toHaveBeenCalled();
        expect(success).not.toHaveBeenCalled();
    });

    it('STORAGE shows the recovery instructions; local storage is still wiped and the window returns to login', async () => {
        const message = 'Não foi possível apagar cache.json (EPERM). Feche o app e apague C:\\ud manualmente.';
        installApi({ clearAllData: vi.fn().mockResolvedValue(fail('STORAGE', message)) });
        const error = vi.spyOn(toast, 'error');
        mount();

        document.getElementById('clearDataBtn')!.click();
        await vi.advanceTimersByTimeAsync(2_000);

        expect(error).toHaveBeenCalledWith(message);
        expect(localStorage.length).toBe(0);
        expect(getActiveAccount()).toBeNull();
        expect(window.location.hash).toBe('#/login');
    });
});
