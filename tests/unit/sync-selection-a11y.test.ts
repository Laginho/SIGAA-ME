// @vitest-environment jsdom
/**
 * A11Y-001 — sync-selection: os cartões clicáveis viram <button> nativo, com
 * o título interno sem ser um heading (button não pode ter heading como
 * descendente pelo modelo de conteúdo do HTML).
 *
 * Seam: `renderSyncSelectionPage`, como o teste existente do arquivo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

describe('sync-selection: .progress-text usa token temático (A11Y-003)', () => {
    it('não fixa um literal de cor de tema claro sobre --color-surface', () => {
        const css = readFileSync(
            path.join(process.cwd(), 'src/styles/sync-selection.css'),
            'utf8',
        );
        const block = css.match(/\.progress-text\s*\{([^}]*)\}/)?.[1];
        expect(block).toBeDefined();
        expect(block).toMatch(/color:\s*var\(--color-text-muted\)/);
        expect(block).not.toMatch(/color:\s*#[0-9a-fA-F]+/);
    });
});

describe('sync-selection: .back-link:hover usa token temático (A11Y-003)', () => {
    it('não fixa um literal de cor de tema claro', () => {
        const css = readFileSync(
            path.join(process.cwd(), 'src/styles/sync-selection.css'),
            'utf8',
        );
        const block = css.match(/\.back-link:hover\s*\{([^}]*)\}/)?.[1];
        expect(block).toBeDefined();
        expect(block).toMatch(/(?<!-)color:\s*var\(--color-primary-hover\)/);
        expect(block).not.toMatch(/(?<!-)color:\s*#[0-9a-fA-F]+/);
    });
});
