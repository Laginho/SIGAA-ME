// @vitest-environment jsdom
/**
 * A11Y-001 — sync-selection: os cartões clicáveis viram <button> nativo, com
 * o título interno sem ser um heading (button não pode ter heading como
 * descendente pelo modelo de conteúdo do HTML).
 *
 * Seam: `renderSyncSelectionPage`, como o teste existente do arquivo.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderSyncSelectionPage } from '../../src/pages/sync-selection';

function buildApp(): HTMLDivElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
});

describe('sync-selection: cartões clicáveis são <button>', () => {
    it.each(['btnFastSync', 'btnFullSync'])('%s é um <button type="button">', (id) => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        const card = document.getElementById(id);
        expect(card?.tagName).toBe('BUTTON');
        expect((card as HTMLButtonElement).type).toBe('button');
    });

    it.each([
        ['btnFastSync', 'Modo Rápido'],
        ['btnFullSync', 'Modo Completo'],
    ])('%s não contém conteúdo de fluxo (div, p, heading) dentro do botão', (id, title) => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        const card = document.getElementById(id)!;
        expect(card.querySelector('div, p, h1, h2, h3, h4, h5, h6')).toBeNull();
        expect(card.querySelector('.card-title')?.textContent).toBe(title);
    });
});
