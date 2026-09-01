/**
 * Characterizes CacheService (electron/services/cache.service.ts) — the
 * seen-items baseline behind sync notifications. See plans/002 for context;
 * plan 003 fixed the upstream parser instead (see the id-less-item test below).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

const storage = vi.hoisted(() => {
    const files = new Map<string, string>();
    return { files };
});

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => 'sigaa-me-cache-tests') }
}));
vi.mock('fs', () => ({
    existsSync: vi.fn((file: string) => storage.files.has(file)),
    readFileSync: vi.fn((file: string) => storage.files.get(file) ?? ''),
    writeFileSync: vi.fn((file: string, content: string) => storage.files.set(file, String(content)))
}));

import { CacheService } from '../../electron/services/cache.service';

describe('CacheService', () => {
    beforeEach(() => {
        storage.files.clear();
        vi.clearAllMocks();
    });

    it('returns an empty baseline for a course never seen before', () => {
        const service = new CacheService();
        expect(service.getCourseState('x')).toEqual({ files: [], news: [] });
    });

    it('reports an empty diff once the baseline has been committed for the same ids', () => {
        const service = new CacheService();
        service.updateCourseState('c1', ['1', '2'], ['9']);

        const diff = service.diffCourseState('c1', [{ id: '1' }, { id: '2' }], [{ id: '9' }]);

        expect(diff.newFiles).toEqual([]);
        expect(diff.newNews).toEqual([]);
    });

    it('reports only the ids not present in the baseline', () => {
        const service = new CacheService();
        service.updateCourseState('c1', ['1'], []);

        const diff = service.diffCourseState('c1', [{ id: '1' }, { id: '2' }], []);

        expect(diff.newFiles).toEqual([{ id: '2' }]);
    });

    it('coerces numeric ids to strings before comparing against the baseline', () => {
        const service = new CacheService();
        service.updateCourseState('c1', ['42'], []);

        const diff = service.diffCourseState('c1', [{ id: 42 }], []);

        expect(diff.newFiles).toEqual([]);
    });

    it('never reports an id-less item as new, even against an empty baseline — the parser is responsible for always supplying an id (link-type materials get a deterministic `link:<url>` id since plan 003), and this filter stays as a guard against the case where it does not', () => {
        const service = new CacheService();

        const diff = service.diffCourseState('c1', [{ name: 'Lista', type: 'link', url: 'http://example.com' }], []);

        expect(diff.newFiles).toEqual([]);
    });

    it("normalizes ids persisted with the JSF closing quote (555') so a cache written before BUG-009 does not report every file as new", () => {
        storage.files.set(
            path.join('sigaa-me-cache-tests', 'cache.json'),
            JSON.stringify({ c1: { files: ["555'", "556'"], news: ['9'] } })
        );

        const service = new CacheService();
        const diff = service.diffCourseState('c1', [{ id: '555' }, { id: '556' }], [{ id: '9' }]);

        expect(diff.newFiles).toEqual([]);
        expect(diff.newNews).toEqual([]);
    });

    it('recovers to an empty cache instead of throwing when cache.json on disk is corrupt', () => {
        storage.files.set(path.join('sigaa-me-cache-tests', 'cache.json'), '{not-json');

        const service = new CacheService();

        expect(service.getCourseState('anything')).toEqual({ files: [], news: [] });
    });

    it('swallows a write failure instead of letting it propagate out of updateCourseState', () => {
        const service = new CacheService();
        vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
            throw new Error('disk full');
        });
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => service.updateCourseState('c1', ['1'], [])).not.toThrow();
        expect(errorSpy).toHaveBeenCalled();
    });
});
