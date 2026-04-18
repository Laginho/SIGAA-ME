// @vitest-environment jsdom
/**
 * Unit Tests: Toast Component
 *
 * Tests the toast notification system using jsdom so we can assert on DOM state.
 * No Electron, no CSS (mocked by Vitest), no network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The toast module uses requestAnimationFrame — provide a synchronous stub
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });

// Import AFTER stub so the module picks it up
import { toast } from '../../src/components/toast';

describe('Toast Component', () => {
    beforeEach(() => {
        // Clean slate for every test
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllTimers();
    });

    // ── Container creation ──────────────────────────────────

    it('creates the #toast-container on first call', () => {
        toast.info('hello');
        expect(document.getElementById('toast-container')).not.toBeNull();
    });

    it('reuses the existing container on subsequent calls', () => {
        toast.info('first');
        toast.info('second');
        const containers = document.querySelectorAll('#toast-container');
        expect(containers.length).toBe(1);
    });

    // ── Variant classes ─────────────────────────────────────

    it('applies .toast--success class for toast.success()', () => {
        toast.success('Great!');
        const el = document.querySelector('.toast--success');
        expect(el).not.toBeNull();
    });

    it('applies .toast--error class for toast.error()', () => {
        toast.error('Oops!');
        const el = document.querySelector('.toast--error');
        expect(el).not.toBeNull();
    });

    it('applies .toast--info class for toast.info()', () => {
        toast.info('FYI');
        const el = document.querySelector('.toast--info');
        expect(el).not.toBeNull();
    });

    // ── Message content ─────────────────────────────────────

    it('renders the correct message text', () => {
        toast.success('Download concluído!');
        const msg = document.querySelector('.toast__message');
        expect(msg?.textContent).toBe('Download concluído!');
    });

    it('renders the correct icon for success', () => {
        toast.success('ok');
        const icon = document.querySelector('.toast__icon');
        expect(icon?.textContent).toBe('✅');
    });

    it('renders the correct icon for error', () => {
        toast.error('fail');
        const icon = document.querySelector('.toast__icon');
        expect(icon?.textContent).toBe('❌');
    });

    it('renders the correct icon for info', () => {
        toast.info('note');
        const icon = document.querySelector('.toast__icon');
        expect(icon?.textContent).toBe('ℹ️');
    });

    // ── Visibility ──────────────────────────────────────────

    it('adds .toast--visible immediately (via requestAnimationFrame stub)', () => {
        toast.success('visible');
        const el = document.querySelector('.toast');
        expect(el?.classList.contains('toast--visible')).toBe(true);
    });

    // ── Multiple toasts ─────────────────────────────────────

    it('can stack multiple toasts', () => {
        toast.success('one');
        toast.error('two');
        toast.info('three');
        const toasts = document.querySelectorAll('.toast');
        expect(toasts.length).toBe(3);
    });

    // ── Auto-dismiss ────────────────────────────────────────

    it('removes .toast--visible after dismiss duration', () => {
        vi.useFakeTimers();
        // Re-apply rAF stub because useFakeTimers() replaces it
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });

        toast.success('bye');
        const el = document.querySelector('.toast') as HTMLElement;
        expect(el.classList.contains('toast--visible')).toBe(true);

        vi.advanceTimersByTime(4001); // past DISMISS_DURATION (4000ms)
        expect(el.classList.contains('toast--visible')).toBe(false);

        vi.useRealTimers();
    });
});
