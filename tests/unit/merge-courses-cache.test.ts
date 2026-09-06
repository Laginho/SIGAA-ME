// @vitest-environment jsdom
/**
 * Unit Tests: mergeCoursesIntoCache
 *
 * Red-green tests for plan 004: manual sync was overwriting the course cache
 * instead of merging, which (1) wiped previously-downloaded news content on a
 * fast sync, and (2) dropped courses not yet processed on a partial failure.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readAccountItem, setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { mergeCoursesIntoCache } from '../../src/utils/ui-helpers';

// DATA-001: o cache é por conta; a fixture entra pelo escritor com escopo.
const ACCOUNT = { id: 'acc-test', name: 'ALUNO' };

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActiveAccount(ACCOUNT);
});

describe('mergeCoursesIntoCache', () => {
    it('preserves cached news content when incoming news lacks it (fast-sync shape)', () => {
        writeAccountItem('courses', JSON.stringify([
            { id: 'A', name: 'Course A', news: [{ id: '1', content: 'BODY' }] },
        ]));

        mergeCoursesIntoCache([
            { id: 'A', name: 'Course A', news: [{ id: '1' }, { id: '2' }] },
        ]);

        const result = JSON.parse(readAccountItem('courses') || '[]');
        expect(result).toHaveLength(1);
        const newsById = Object.fromEntries(result[0].news.map((n: any) => [n.id, n]));
        expect(newsById['1'].content).toBe('BODY');
        expect(newsById['2'].content).toBeUndefined();
    });

    it('keeps courses not present in incoming (partial sync)', () => {
        writeAccountItem('courses', JSON.stringify([
            { id: 'A', name: 'Course A', news: [] },
            { id: 'B', name: 'Course B', news: [] },
        ]));

        mergeCoursesIntoCache([
            { id: 'A', name: 'Course A Updated', news: [] },
        ]);

        const result = JSON.parse(readAccountItem('courses') || '[]');
        expect(result).toHaveLength(2);
        const byId = Object.fromEntries(result.map((c: any) => [c.id, c]));
        expect(byId['A'].name).toBe('Course A Updated');
        expect(byId['B'].name).toBe('Course B');
    });

    it('replaceSet: true drops courses absent from incoming', () => {
        writeAccountItem('courses', JSON.stringify([
            { id: 'A', name: 'Course A', news: [] },
            { id: 'B', name: 'Course B', news: [] },
        ]));

        mergeCoursesIntoCache([
            { id: 'A', name: 'Course A Updated', news: [] },
        ], { replaceSet: true });

        const result = JSON.parse(readAccountItem('courses') || '[]');
        expect(result).toEqual([{ id: 'A', name: 'Course A Updated', news: [] }]);
    });

    it('treats missing/corrupt existing cache as empty (no throw)', () => {
        writeAccountItem('courses', 'not-valid-json{{');

        expect(() => mergeCoursesIntoCache([
            { id: 'A', name: 'Course A', news: [] },
        ])).not.toThrow();

        const result = JSON.parse(readAccountItem('courses') || '[]');
        expect(result).toEqual([{ id: 'A', name: 'Course A', news: [] }]);
    });

    it('fresh incoming content wins over stale cached content', () => {
        writeAccountItem('courses', JSON.stringify([
            { id: 'A', name: 'Course A', news: [{ id: '1', content: 'OLD' }] },
        ]));

        mergeCoursesIntoCache([
            { id: 'A', name: 'Course A', news: [{ id: '1', content: 'NEW' }] },
        ]);

        const result = JSON.parse(readAccountItem('courses') || '[]');
        expect(result[0].news[0].content).toBe('NEW');
    });

    it('writes the sync timestamp', () => {
        mergeCoursesIntoCache([{ id: 'A', name: 'Course A', news: [] }], {}, 12345);
        expect(readAccountItem('sync-timestamp')).toBe('12345');
    });

    it('keeps the sync timestamp untouched with keepTimestamp (a news-body cache write is not a sync)', () => {
        writeAccountItem('sync-timestamp', '111');
        mergeCoursesIntoCache([{ id: 'A', name: 'Course A', news: [{ id: '1', content: '<p>ok</p>' }] }], { keepTimestamp: true });
        expect(readAccountItem('sync-timestamp')).toBe('111');
    });

    it('sanitizes news content before writing to cache (SEC-001)', () => {
        mergeCoursesIntoCache([{
            id: 'A',
            name: 'Course A',
            news: [{ id: '1', content: '<p>ok</p><script>x</script><img src=x onerror=alert(1)>' }],
        }]);

        const result = JSON.parse(readAccountItem('courses') || '[]');
        const content = result[0].news[0].content as string;
        expect(content).toContain('<p>ok</p>');
        expect(content).not.toContain('<script');
        expect(content).not.toContain('onerror');
    });
});
