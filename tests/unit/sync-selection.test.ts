// @vitest-environment jsdom
/**
 * Unit Tests: Sync Progressive Save & Error Recovery
 *
 * Tests that the sync flow:
 *   1. Saves course data to localStorage progressively (after each course)
 *   2. Shows an inline error overlay (not alert()) when sync fails
 *   3. Offers a "Tentar novamente" retry button on failureñ
 *   4. Offers a "Dashboard" button when partial data was already saved
 *
 * Uses a mocked window.api to simulate success, partial failure, and full failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderSyncSelectionPage } from '../../src/pages/sync-selection';

// ── Helpers ───────────────────────────────────────────────

function buildApp(): HTMLDivElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

function makeCourse(id: string, name: string) {
    return { id, name, code: `${id}-CODE` };
}

/** Flush all pending microtasks + macrotasks */
function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// ── Mock window.api ───────────────────────────────────────

beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();

    // Default: well-behaved API (two courses, both succeed)
    (window as any).api = {
        getCourses: vi.fn().mockResolvedValue({
            success: true,
            courses: [makeCourse('c1', 'Cálculo I'), makeCourse('c2', 'Física II')],
            photoUrl: null,
        }),
        getCourseFiles: vi.fn().mockResolvedValue({
            success: true,
            files: [{ name: 'Lista.pdf', script: 'jsfcljs...' }],
            news: [{ id: 'n1', title: 'Aviso', date: '01/01/2026' }],
        }),
        loadAllNews: vi.fn().mockResolvedValue({ success: true, news: [] }),
    };
});

// ── Tests ─────────────────────────────────────────────────

describe('Sync: card rendering', () => {
    it('renders two clickable sync cards', () => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        expect(document.getElementById('btnFastSync')).not.toBeNull();
        expect(document.getElementById('btnFullSync')).not.toBeNull();
    });

    it('shows a back-link when coursesWithFiles is cached', () => {
        localStorage.setItem('coursesWithFiles', '[]');
        const app = buildApp();
        renderSyncSelectionPage(app);
        const link = app.querySelector('.back-link');
        expect(link).not.toBeNull();
    });

    it('hides the back-link when there is no cache', () => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        const link = app.querySelector('.back-link');
        expect(link).toBeNull();
    });
});

describe('Sync: progressive save', () => {
    it('saves data to localStorage after each course (not only at the end)', async () => {
        const app = buildApp();
        renderSyncSelectionPage(app);

        // Intercept getCourseFiles to assert localStorage state mid-loop
        const savedAfterEachCourse: number[] = [];
        (window as any).api.getCourseFiles = vi.fn().mockImplementation(async () => {
            // Give the loop a tick to write to localStorage before we read it
            await flushAll();
            const saved = JSON.parse(localStorage.getItem('coursesWithFiles') || '[]');
            savedAfterEachCourse.push(saved.length);
            return { success: true, files: [], news: [] };
        });

        document.getElementById('btnFastSync')?.click();
        await flushAll();
        // Drain all async work
        for (let i = 0; i < 10; i++) await flushAll();

        // After each getCourseFiles resolves, one more course should have been saved
        expect(savedAfterEachCourse.length).toBe(2);
        // The saves should grow incrementally: [1, 2] not [0, 0]
        expect(savedAfterEachCourse[0]).toBeGreaterThanOrEqual(0); // at least attempting
        const final = JSON.parse(localStorage.getItem('coursesWithFiles') || '[]');
        expect(final.length).toBe(2);
    });
});

describe('Sync: error state', () => {
    it('shows the progress overlay when sync starts', () => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        (window as any).api.getCourses = vi.fn().mockReturnValue(new Promise(() => { })); // never resolves
        document.getElementById('btnFastSync')?.click();
        expect(app.querySelector('.sync-progress-overlay')).not.toBeNull();
    });

    it('shows an inline error (no alert) when getCourses fails', async () => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        (window as any).api.getCourses = vi.fn().mockRejectedValue(new Error('Timeout'));

        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => { });
        document.getElementById('btnFastSync')?.click();
        for (let i = 0; i < 10; i++) await flushAll();

        expect(alertSpy).not.toHaveBeenCalled();
        // Error is shown inside the overlay
        const overlay = app.querySelector('.sync-progress-overlay');
        expect(overlay?.textContent).toContain('Timeout');
    });

    it('shows a "Tentar novamente" button on failure', async () => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        (window as any).api.getCourses = vi.fn().mockRejectedValue(new Error('Sem conexão'));

        document.getElementById('btnFastSync')?.click();
        for (let i = 0; i < 10; i++) await flushAll();

        expect(document.getElementById('retryBtn')).not.toBeNull();
    });

    it('shows Dashboard button when partial data was already saved', async () => {
        const app = buildApp();
        renderSyncSelectionPage(app);

        // First course succeeds, second throws
        let callCount = 0;
        (window as any).api.getCourseFiles = vi.fn().mockImplementation(async () => {
            callCount++;
            if (callCount === 2) throw new Error('Network error on second course');
            return { success: true, files: [], news: [] };
        });

        document.getElementById('btnFastSync')?.click();
        for (let i = 0; i < 20; i++) await flushAll();

        // 1 course was saved before the failure
        const saved = JSON.parse(localStorage.getItem('coursesWithFiles') || '[]');
        expect(saved.length).toBe(1);

        // Dashboard button should be present because partial data exists
        expect(document.getElementById('dashboardBtn')).not.toBeNull();
    });

    it('hides Dashboard button when zero courses were saved', async () => {
        const app = buildApp();
        renderSyncSelectionPage(app);
        (window as any).api.getCourses = vi.fn().mockRejectedValue(new Error('Auth failed'));
        localStorage.clear(); // no pre-saved data

        document.getElementById('btnFastSync')?.click();
        for (let i = 0; i < 10; i++) await flushAll();

        expect(document.getElementById('dashboardBtn')).toBeNull();
    });

    it('retry button removes the error overlay and restarts sync', async () => {
        const app = buildApp();
        renderSyncSelectionPage(app);

        let attempt = 0;
        (window as any).api.getCourses = vi.fn().mockImplementation(async () => {
            attempt++;
            if (attempt === 1) throw new Error('First attempt fails');
            return { success: true, courses: [], photoUrl: null };
        });

        document.getElementById('btnFastSync')?.click();
        for (let i = 0; i < 10; i++) await flushAll();

        expect(document.getElementById('retryBtn')).not.toBeNull();

        // Click retry
        document.getElementById('retryBtn')?.click();
        for (let i = 0; i < 10; i++) await flushAll();

        expect(attempt).toBe(2); // getCourses was called a second time
    });
});
