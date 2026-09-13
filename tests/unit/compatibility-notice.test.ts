// @vitest-environment jsdom
/**
 * PORTAL-006 — aviso de incompatibilidade no dashboard e na tela de sync.
 *
 * Seam: `renderDashboardPage` e `renderSyncSelectionPage`, como os demais
 * testes dessas páginas. `getCompatibilityStatus`/`onCompatibilityChanged` são
 * stubs — a lógica de main (limiar, persistência) é `PORTAL-005`, já testada
 * lá; aqui só importa o que o renderer mostra e esconde.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { renderDashboardPage } from '../../src/pages/dashboard';
import { renderSyncSelectionPage } from '../../src/pages/sync-selection';
import type { CompatibilityStatus } from '../../shared/ipc';

const ACCOUNT = { id: 'acc-portal-006', name: 'ALUNO' };
const COURSE = { id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1', fileCount: 0, files: [], news: [] };

const OK: CompatibilityStatus = { state: 'ok' };
const INCOMPATIBLE: CompatibilityStatus = { state: 'incompatible', since: Date.UTC(2026, 8, 1), failures: 3, lastCode: 'SELECTOR_DRIFT' };

type CompatListener = (status: CompatibilityStatus) => void;

function installApi(initialStatus: CompatibilityStatus) {
    const listeners: CompatListener[] = [];
    const off = vi.fn();
    const api = {
        getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
        onBackgroundSyncUpdate: vi.fn(() => () => undefined),
        getCourses: vi.fn().mockResolvedValue({ success: true, data: { courses: [] } }),
        getCourseFiles: vi.fn().mockResolvedValue({ success: true, data: { files: [], news: [] } }),
        loadAllNews: vi.fn().mockResolvedValue({ success: true, data: [] }),
        getCompatibilityStatus: vi.fn().mockResolvedValue(initialStatus),
        onCompatibilityChanged: vi.fn((cb: CompatListener) => {
            listeners.push(cb);
            return off;
        }),
    };
    Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
    return { api, listeners, off };
}

function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function mountDashboard() {
    const app = document.createElement('div');
    document.body.replaceChildren(app);
    renderDashboardPage(app, { ...ACCOUNT });
    return app;
}

function mountSyncSelection() {
    const app = document.createElement('div');
    document.body.replaceChildren(app);
    renderSyncSelectionPage(app);
    return app;
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    setActiveAccount(ACCOUNT);
    writeAccountItem('courses', JSON.stringify([COURSE]));
});

describe('dashboard: aviso de incompatibilidade', () => {
    it('com getCompatibilityStatus incompatible, mostra o aviso com a data formatada', async () => {
        installApi(INCOMPATIBLE);
        mountDashboard();
        await flush();

        const notice = document.querySelector('.compatibility-notice');
        expect(notice).not.toBeNull();
        expect(notice!.textContent).toContain('01/09/2026');
        expect(notice!.textContent).toContain('sincronização automática está pausada');
    });

    it('com ok, nenhum nó do aviso existe no DOM', async () => {
        installApi(OK);
        mountDashboard();
        await flush();

        expect(document.querySelector('.compatibility-notice')).toBeNull();
    });

    it('compatibility-changed para incompatible mostra o aviso, e para ok remove, sem reload', async () => {
        const { listeners } = installApi(OK);
        mountDashboard();
        await flush();
        expect(document.querySelector('.compatibility-notice')).toBeNull();

        listeners[0](INCOMPATIBLE);
        expect(document.querySelector('.compatibility-notice')).not.toBeNull();

        listeners[0](OK);
        expect(document.querySelector('.compatibility-notice')).toBeNull();
    });

    it('montar de novo cancela a assinatura anterior (um listener vivo por vez)', async () => {
        const { listeners, off } = installApi(OK);
        mountDashboard();
        await flush();
        mountDashboard();
        await flush();

        expect(listeners).toHaveLength(2);
        expect(off).toHaveBeenCalledTimes(1);
    });
});

describe('sync-selection: aviso de incompatibilidade', () => {
    it('com getCompatibilityStatus incompatible, mostra o aviso acima dos botões', async () => {
        installApi(INCOMPATIBLE);
        mountSyncSelection();
        await flush();

        const notice = document.querySelector('.compatibility-notice');
        expect(notice).not.toBeNull();
        expect(notice!.textContent).toContain('01/09/2026');
    });

    it('com ok, nenhum nó do aviso existe no DOM, e os botões continuam habilitados', async () => {
        installApi(OK);
        mountSyncSelection();
        await flush();

        expect(document.querySelector('.compatibility-notice')).toBeNull();
        expect((document.getElementById('btnFastSync') as HTMLButtonElement).disabled).toBe(false);
        expect((document.getElementById('btnFullSync') as HTMLButtonElement).disabled).toBe(false);
    });

    it('compatibility-changed alterna o aviso sem reload, e os botões seguem habilitados durante o aviso', async () => {
        const { listeners } = installApi(OK);
        mountSyncSelection();
        await flush();

        listeners[0](INCOMPATIBLE);
        expect(document.querySelector('.compatibility-notice')).not.toBeNull();
        expect((document.getElementById('btnFastSync') as HTMLButtonElement).disabled).toBe(false);

        listeners[0](OK);
        expect(document.querySelector('.compatibility-notice')).toBeNull();
    });

    it('montar de novo cancela a assinatura anterior (um listener vivo por vez)', async () => {
        const { listeners, off } = installApi(OK);
        mountSyncSelection();
        await flush();
        mountSyncSelection();
        await flush();

        expect(listeners).toHaveLength(2);
        expect(off).toHaveBeenCalledTimes(1);
    });
});
