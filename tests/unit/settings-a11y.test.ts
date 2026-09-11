// @vitest-environment jsdom
/**
 * A11Y-001 — settings: os toggles são `<input type="checkbox">` dentro de um
 * `<label class="switch">` que não envolve o texto visível do rótulo
 * (`.setting-label` fica num irmão), então o controle não tem nome acessível
 * sem um `aria-label` explícito. O mesmo vale para o `<select>` de intervalo.
 * Sem isso, o scan automático (critério de aceite do A11Y-001) acusa
 * "form element does not have an accessible name" — a mesma classe de
 * problema do sino/engrenagem, só que em `<input>`/`<select>` em vez de
 * `<button>`.
 *
 * Seam: `renderSettingsPage`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSettingsPage } from '../../src/pages/settings';

beforeEach(() => {
    document.body.innerHTML = '';
    (window as any).api = {
        getSettings: vi.fn().mockResolvedValue({
            theme: 'light',
            runInBackground: true,
            openAtLogin: false,
            syncInterval: 30,
            autoDownloadUpdates: false,
            lastDownloadPath: null,
        }),
    };
});

async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderSettingsPage(container);
    return container;
}

describe('settings: controles de formulário têm nome acessível', () => {
    it.each([
        ['themeToggle', 'Modo Escuro'],
        ['runInBackgroundToggle', 'Executar em Segundo Plano'],
        ['openAtLoginToggle', 'Iniciar com o Windows'],
        ['autoDownloadToggle', 'Download Automático'],
        ['syncIntervalSelect', 'Intervalo de Busca'],
    ])('%s tem aria-label', async (id, label) => {
        await mount();
        expect(document.getElementById(id)?.getAttribute('aria-label')).toBe(label);
    });
});
