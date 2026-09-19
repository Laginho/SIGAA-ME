// @vitest-environment jsdom
/**
 * BUG-023: `renderSettingsPage` aguarda `getSettings` antes da primeira
 * escrita no container. Se o usuário navegou enquanto o IPC estava pendente,
 * a resposta tardia não pode substituir a página que ocupa o container agora.
 * Seam: `renderSettingsPage`, com a página de login real montada por cima.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O toast usa requestAnimationFrame — stub síncrono, como em toast.test.ts.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });

import { renderSettingsPage } from '../../src/pages/settings';
import { renderLoginPage } from '../../src/pages/login';
import { ok } from '../../shared/errors';

const BASE_SETTINGS = {
    theme: 'light' as const,
    runInBackground: true,
    openAtLogin: false,
    syncInterval: 30,
    autoDownloadUpdates: false,
    lastDownloadPath: '/downloads',
};

function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

let container: HTMLDivElement;

beforeEach(() => {
    document.body.innerHTML = '';
    window.location.hash = '#/settings';
    container = document.createElement('div');
    document.body.appendChild(container);
});

describe('settings: resposta tardia de getSettings não substitui a rota seguinte (BUG-023)', () => {
    it('BUG-024: navegar durante updateSetting não reentra em configurações', async () => {
        let resolveUpdate!: (value: ReturnType<typeof ok<undefined>>) => void;
        const getSettings = vi.fn().mockResolvedValue({ ...BASE_SETTINGS });
        Object.defineProperty(window, 'api', { configurable: true, writable: true, value: {
            getSettings,
            updateSetting: vi.fn(() => new Promise(resolve => { resolveUpdate = resolve; })),
        } });

        await renderSettingsPage(container);
        container.querySelector<HTMLButtonElement>('#clearDownloadsBtn')!.click();
        window.location.hash = '#/login';
        renderLoginPage(container);
        resolveUpdate(ok(undefined));
        await flushAll();

        expect(container.querySelector('.login-title')?.textContent).toBe('SIGAA-ME');
        expect(container.querySelector('.settings-page')).toBeNull();
        expect(getSettings).toHaveBeenCalledTimes(1);
    });

    it('critério 4: navegar para login com getSettings pendente mantém o login quando a resposta chega', async () => {
        let resolveGetSettings!: (value: unknown) => void;
        (window as any).api = {
            getSettings: vi.fn(() => new Promise(resolve => { resolveGetSettings = resolve; })),
            updateSetting: vi.fn().mockResolvedValue(ok(undefined)),
        };

        const pending = renderSettingsPage(container);
        await flushAll();
        expect(container.querySelector('.settings-page')).toBeNull();

        // Usuário navega: o app muda o hash e o roteador monta login no mesmo container.
        window.location.hash = '#/login';
        renderLoginPage(container);
        expect(container.querySelector('.login-title')?.textContent).toBe('SIGAA-ME');

        resolveGetSettings({ ...BASE_SETTINGS });
        await pending;
        for (let i = 0; i < 10; i++) await flushAll();

        expect(container.querySelector('.login-title')?.textContent).toBe('SIGAA-ME');
        expect(container.querySelector('.settings-page')).toBeNull();
    });

    it('critério 5: re-render após limpar pasta padrão com getSettings pendente não substitui a outra página', async () => {
        let resolveSecond!: (value: unknown) => void;
        const getSettings = vi.fn()
            .mockResolvedValueOnce({ ...BASE_SETTINGS })
            .mockImplementationOnce(() => new Promise(resolve => { resolveSecond = resolve; }));
        (window as any).api = {
            getSettings,
            updateSetting: vi.fn().mockResolvedValue(ok(undefined)),
        };

        await renderSettingsPage(container);
        expect(container.querySelector('.settings-page')).not.toBeNull();

        const clearBtn = container.querySelector<HTMLButtonElement>('#clearDownloadsBtn');
        expect(clearBtn).not.toBeNull();
        clearBtn!.dispatchEvent(new Event('click'));
        for (let i = 0; i < 10; i++) await flushAll();
        expect(getSettings).toHaveBeenCalledTimes(2);

        // Segundo getSettings pendente; usuário navega para login.
        window.location.hash = '#/login';
        renderLoginPage(container);
        expect(container.querySelector('.login-title')?.textContent).toBe('SIGAA-ME');

        resolveSecond({ ...BASE_SETTINGS, lastDownloadPath: null });
        for (let i = 0; i < 10; i++) await flushAll();

        expect(container.querySelector('.login-title')?.textContent).toBe('SIGAA-ME');
        expect(container.querySelector('.settings-page')).toBeNull();
    });
});
