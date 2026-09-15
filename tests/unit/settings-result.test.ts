// @vitest-environment jsdom
/**
 * BUG-017 — os seis controles de settings descartavam o `AppResult` de
 * `updateSetting`: uma falha (`success: false`) virava toast de sucesso e o
 * controle ficava no valor novo com o disco no valor antigo.
 *
 * Seam: `renderSettingsPage`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// O toast usa requestAnimationFrame — stub síncrono, como em toast.test.ts.
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });

import { renderSettingsPage } from '../../src/pages/settings';

const BASE_SETTINGS = {
    theme: 'light' as const,
    runInBackground: true,
    openAtLogin: false,
    syncInterval: 30,
    autoDownloadUpdates: false,
    lastDownloadPath: '/downloads',
};

function failResult(message = 'Falha ao gravar no disco') {
    return { success: false as const, error: { code: 'STORAGE' as const, message } };
}

/** Flush the microtask queue so the `await window.api.updateSetting(...)` inside the handler settles. */
function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

let updateSetting: ReturnType<typeof vi.fn>;

beforeEach(() => {
    document.body.innerHTML = '';
    updateSetting = vi.fn();
    (window as any).api = {
        getSettings: vi.fn().mockResolvedValue({ ...BASE_SETTINGS }),
        updateSetting,
    };
});

async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSettingsPage(container);
    return container;
}

function errorToastCount() {
    return document.querySelectorAll('.toast--error').length;
}

function successOrInfoToastCount() {
    return document.querySelectorAll('.toast--success, .toast--info').length;
}

describe('settings: updateSetting falho não vira sucesso', () => {
    it('themeToggle: reverte e mostra erro quando updateSetting falha', async () => {
        updateSetting.mockResolvedValue(failResult());
        await mount();
        const toggle = document.getElementById('themeToggle') as HTMLInputElement;

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        await flush();

        expect(toggle.checked).toBe(false);
        expect(document.documentElement.getAttribute('data-theme')).not.toBe('dark');
        expect(errorToastCount()).toBe(1);
        expect(successOrInfoToastCount()).toBe(0);
    });

    it('clearDownloadsBtn: mostra erro e não limpa a preferência quando updateSetting falha', async () => {
        updateSetting.mockResolvedValue(failResult());
        const container = await mount();
        document.getElementById('clearDownloadsBtn')?.dispatchEvent(new Event('click'));
        await flush();

        expect(errorToastCount()).toBe(1);
        expect(successOrInfoToastCount()).toBe(0);
        // Falha não reflete visualmente: o botão de limpar continua lá.
        expect(container.querySelector('#clearDownloadsBtn')).not.toBeNull();
    });

    it('runInBackgroundToggle: reverte e mostra erro quando updateSetting falha', async () => {
        updateSetting.mockResolvedValue(failResult());
        await mount();
        const toggle = document.getElementById('runInBackgroundToggle') as HTMLInputElement;

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));
        await flush();

        expect(toggle.checked).toBe(true);
        expect(document.getElementById('openAtLoginContainer')?.classList.contains('disabled-item')).toBe(false);
        expect(errorToastCount()).toBe(1);
        expect(successOrInfoToastCount()).toBe(0);
    });

    it('openAtLoginToggle: reverte e mostra erro quando updateSetting falha', async () => {
        updateSetting.mockResolvedValue(failResult());
        await mount();
        const toggle = document.getElementById('openAtLoginToggle') as HTMLInputElement;

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        await flush();

        expect(toggle.checked).toBe(false);
        expect(errorToastCount()).toBe(1);
        expect(successOrInfoToastCount()).toBe(0);
    });

    it('syncIntervalSelect: reverte e mostra erro quando updateSetting falha', async () => {
        updateSetting.mockResolvedValue(failResult());
        await mount();
        const select = document.getElementById('syncIntervalSelect') as HTMLSelectElement;

        select.value = '60';
        select.dispatchEvent(new Event('change'));
        await flush();

        expect(select.value).toBe('30');
        expect(errorToastCount()).toBe(1);
        expect(successOrInfoToastCount()).toBe(0);
    });

    it('autoDownloadToggle: reverte e mostra erro quando updateSetting falha', async () => {
        updateSetting.mockResolvedValue(failResult());
        await mount();
        const toggle = document.getElementById('autoDownloadToggle') as HTMLInputElement;

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        await flush();

        expect(toggle.checked).toBe(false);
        expect(errorToastCount()).toBe(1);
        expect(successOrInfoToastCount()).toBe(0);
    });
});
