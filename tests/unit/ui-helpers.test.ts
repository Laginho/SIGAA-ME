// @vitest-environment jsdom
/**
 * Unit Tests: UI Helpers
 *
 * Tests for the pure utility functions in src/utils/ui-helpers.ts:
 *   - formatSyncLabel: timestamp → human-readable relative badge
 *   - isNewsCached: checks localStorage for pre-fetched news content
 *
 * No Electron, no network. Pure logic only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { formatSyncLabel, isNewsCached } from '../../src/utils/ui-helpers';

// ── formatSyncLabel ──────────────────────────────────────

describe('formatSyncLabel', () => {
    const now = new Date('2026-04-18T14:00:00');

    it('returns "agora mesmo" when less than 1 minute ago', () => {
        const ts = now.getTime() - 30_000; // 30 seconds ago
        expect(formatSyncLabel(ts, now)).toBe('agora mesmo');
    });

    it('returns "há 1 min" when exactly 1 minute ago', () => {
        const ts = now.getTime() - 60_000;
        expect(formatSyncLabel(ts, now)).toBe('há 1 min');
    });

    it('returns "há 15 min" when 15 minutes ago', () => {
        const ts = now.getTime() - 15 * 60_000;
        expect(formatSyncLabel(ts, now)).toBe('há 15 min');
    });

    it('returns "há 59 min" when 59 minutes ago', () => {
        const ts = now.getTime() - 59 * 60_000;
        expect(formatSyncLabel(ts, now)).toBe('há 59 min');
    });

    it('returns "hoje às HH:MM" when same day but 1+ hour ago', () => {
        const ts = now.getTime() - 90 * 60_000; // 1.5h ago, still same day
        const result = formatSyncLabel(ts, now);
        expect(result).toMatch(/^hoje às \d{2}:\d{2}$/);
    });

    it('returns "DD/MM às HH:MM" when a different day', () => {
        // Simulate a timestamp from yesterday
        const yesterday = new Date('2026-04-17T10:30:00');
        const result = formatSyncLabel(yesterday.getTime(), now);
        expect(result).toMatch(/^17\/04 às \d{2}:\d{2}$/);
    });

    it('does not return "agora mesmo" when 2 minutes have passed', () => {
        const ts = now.getTime() - 2 * 60_000;
        expect(formatSyncLabel(ts, now)).not.toBe('agora mesmo');
    });
});

// ── isNewsCached ─────────────────────────────────────────

describe('isNewsCached', () => {
    const COURSE_ID = 'course-123';
    const NEWS_ID = 'news-456';

    const buildCache = (overrides: object = {}) => {
        const base = [
            {
                id: COURSE_ID,
                news: [
                    { id: NEWS_ID, title: 'Test News', content: '<p>Content</p>' },
                    { id: 'news-789', title: 'No Content News' },
                ],
            },
        ];
        return JSON.stringify([{ ...base[0], ...overrides }]);
    };

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('returns true when news content exists in cache', () => {
        localStorage.setItem('coursesWithFiles', buildCache());
        expect(isNewsCached(COURSE_ID, NEWS_ID)).toBe(true);
    });

    it('returns false when the news item exists but has no content', () => {
        localStorage.setItem('coursesWithFiles', buildCache());
        expect(isNewsCached(COURSE_ID, 'news-789')).toBe(false);
    });

    it('returns false when the news ID does not exist', () => {
        localStorage.setItem('coursesWithFiles', buildCache());
        expect(isNewsCached(COURSE_ID, 'nonexistent-news')).toBe(false);
    });

    it('returns false when the course ID does not exist', () => {
        localStorage.setItem('coursesWithFiles', buildCache());
        expect(isNewsCached('wrong-course', NEWS_ID)).toBe(false);
    });

    it('returns false when localStorage is empty', () => {
        expect(isNewsCached(COURSE_ID, NEWS_ID)).toBe(false);
    });

    it('returns false when localStorage contains invalid JSON', () => {
        localStorage.setItem('coursesWithFiles', 'not-valid-json{{');
        expect(isNewsCached(COURSE_ID, NEWS_ID)).toBe(false);
    });
});
