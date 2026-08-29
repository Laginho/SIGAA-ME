/**
 * Characterizes BackgroundSyncService.syncNow() (electron/services/background-sync.service.ts) —
 * the sync loop that decides what's new and pushes it to the renderer + OS
 * notifications. See plans/002 for context. Several cases here pin CURRENT
 * (buggy) behavior that plan 003 will deliberately invert — those carry a
 * `// Characterization:` comment naming it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SigaaService } from '../../electron/services/sigaa.service';
import type { BrowserWindow } from 'electron';

vi.mock('electron', () => ({
    app: {
        getPath: () => 'test-userdata',
        getAppPath: () => '.',
        isPackaged: true
    },
    BrowserWindow: class {},
    Notification: class {
        static isSupported() {
            return false;
        }
        show() {}
    }
}));

const cacheState = vi.hoisted(() => {
    const baselines = new Map<string, { files: string[]; news: string[] }>();
    const callLog: string[] = [];
    return { baselines, callLog };
});

vi.mock('../../electron/services/cache.service', () => ({
    cacheService: {
        getCourseState: vi.fn((courseId: string) => {
            cacheState.callLog.push('getCourseState');
            return cacheState.baselines.get(courseId) ?? { files: [], news: [] };
        }),
        // Mirrors the production filter (item.id required, String-coerced comparison)
        // ONLY so the fake behaves like the real cache for the sync loop's purposes —
        // cache.service.ts itself is characterized separately in cache-service.test.ts.
        diffCourseState: vi.fn((courseId: string, currentFiles: any[], currentNews: any[]) => {
            cacheState.callLog.push('diffCourseState');
            const baseline = cacheState.baselines.get(courseId) ?? { files: [], news: [] };
            return {
                newFiles: currentFiles.filter(item => item.id && !baseline.files.includes(String(item.id))),
                newNews: currentNews.filter(item => item.id && !baseline.news.includes(String(item.id)))
            };
        }),
        updateCourseState: vi.fn((courseId: string, files: string[], news: string[]) => {
            cacheState.callLog.push('updateCourseState');
            cacheState.baselines.set(courseId, { files, news });
        })
    }
}));

const settings = {
    theme: 'light' as const,
    autoSync: true,
    lastDownloadPath: null,
    runInBackground: true,
    syncInterval: 60,
    autoDownloadUpdates: false,
    openAtLogin: false
};

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => settings),
        loadCredentials: vi.fn(() => ({ username: 'u', password: 'p' })),
        updateSetting: vi.fn()
    }
}));

import { BackgroundSyncService } from '../../electron/services/background-sync.service';

function makeWindow() {
    const send = vi.fn((_channel: string, payload: unknown) => {
        cacheState.callLog.push('send');
        return payload;
    });
    return {
        isDestroyed: () => false,
        webContents: { send }
    } as unknown as BrowserWindow;
}

function makeSigaaService(overrides: Partial<Record<'getCourses' | 'getCourseFiles' | 'login' | 'downloadAllFiles' | 'getNewsDetail', any>> = {}) {
    return {
        getCourses: vi.fn(async () => ({ success: true, courses: [] })),
        getCourseFiles: vi.fn(async () => ({ success: true, files: [], news: [] })),
        login: vi.fn(async () => ({ success: true })),
        downloadAllFiles: vi.fn(async () => ({ success: true })),
        getNewsDetail: vi.fn(async () => ({ success: false })),
        ...overrides
    } as unknown as SigaaService;
}

describe('BackgroundSyncService.syncNow', () => {
    beforeEach(() => {
        cacheState.baselines.clear();
        cacheState.callLog.length = 0;
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('produces no notifications on a cold start but still populates courses and commits the baseline', async () => {
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ({ success: true, courses: [{ id: 'c1', name: 'Course 1' }] })),
            getCourseFiles: vi.fn(async () => ({
                success: true,
                files: [{ id: '1', name: 'f1.pdf' }, { id: '2', name: 'f2.pdf' }],
                news: [{ id: 'n1', title: 'News 1' }]
            }))
        });
        const window = makeWindow();
        const service = new BackgroundSyncService(sigaaService, () => window);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        expect(window.webContents.send).toHaveBeenCalledTimes(1);
        const payload = (window.webContents.send as any).mock.calls[0][1];
        expect(payload.notifications).toEqual([]);
        expect(payload.courses).toHaveLength(1);
        expect(payload.courses[0].fileCount).toBe(2);
        expect(cacheState.baselines.get('c1')).toEqual({ files: ['1', '2'], news: ['n1'] });
    });

    it('notifies on a warm diff with the expected payload shape', async () => {
        cacheState.baselines.set('c1', { files: ['1'], news: [] });
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ({ success: true, courses: [{ id: 'c1', name: 'Course 1' }] })),
            getCourseFiles: vi.fn(async () => ({
                success: true,
                files: [{ id: '1', name: 'f1.pdf' }, { id: '2', name: 'f2.pdf' }],
                news: []
            }))
        });
        const window = makeWindow();
        const service = new BackgroundSyncService(sigaaService, () => window);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        const payload = (window.webContents.send as any).mock.calls[0][1];
        expect(Object.keys(payload).sort()).toEqual(['courses', 'notifications', 'timestamp']);
        expect(payload.notifications).toHaveLength(1);
        expect(payload.notifications[0]).toMatchObject({ type: 'file', id: 'file-c1-f2.pdf' });
    });

    it('Characterization: commits the cache baseline before delivering to the renderer — a crash in between loses the notification forever. Plan 003 reorders this; this test is EXPECTED to be inverted there.', async () => {
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ({ success: true, courses: [{ id: 'c1', name: 'Course 1' }] })),
            getCourseFiles: vi.fn(async () => ({ success: true, files: [{ id: '1', name: 'f1.pdf' }], news: [] }))
        });
        const window = makeWindow();
        const service = new BackgroundSyncService(sigaaService, () => window);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        const updateIndex = cacheState.callLog.indexOf('updateCourseState');
        const sendIndex = cacheState.callLog.indexOf('send');
        expect(updateIndex).toBeGreaterThanOrEqual(0);
        expect(sendIndex).toBeGreaterThanOrEqual(0);
        expect(updateIndex).toBeLessThan(sendIndex);
    });

    it("Characterization: a failed retry's success flag is discarded — syncNow aborts silently instead of surfacing the failure. Plan 003 makes this an explicit abort.", async () => {
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ({ success: false })),
            login: vi.fn(async () => ({ success: true }))
        });
        const window = makeWindow();
        const service = new BackgroundSyncService(sigaaService, () => window);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await expect(p).resolves.toBeUndefined();

        expect(sigaaService.getCourses).toHaveBeenCalledTimes(2);
        expect(sigaaService.login).toHaveBeenCalledTimes(1);
        expect(window.webContents.send).not.toHaveBeenCalled();
        expect(cacheState.callLog).not.toContain('updateCourseState');
    });

    it('guards against reentrancy: a sync already in flight makes a second call return immediately without a second getCourses call', async () => {
        let resolveGetCourses!: (value: { success: true; courses: any[] }) => void;
        const hang = new Promise<{ success: true; courses: any[] }>(resolve => {
            resolveGetCourses = resolve;
        });
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(() => hang)
        });
        const window = makeWindow();
        const service = new BackgroundSyncService(sigaaService, () => window);

        const first = service.syncNow();
        const second = service.syncNow();
        await second;

        expect(sigaaService.getCourses).toHaveBeenCalledTimes(1);

        resolveGetCourses({ success: true, courses: [] });
        await first;
    });

    it('skips a course whose getCourseFiles call failed but still delivers the courses that succeeded', async () => {
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ({
                success: true,
                courses: [{ id: 'a', name: 'Course A' }, { id: 'b', name: 'Course B' }]
            })),
            getCourseFiles: vi.fn(async (courseId: string) => {
                if (courseId === 'a') return { success: false, message: 'x' };
                return { success: true, files: [{ id: '1', name: 'f1.pdf' }], news: [] };
            })
        });
        const window = makeWindow();
        const service = new BackgroundSyncService(sigaaService, () => window);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await expect(p).resolves.toBeUndefined();

        const payload = (window.webContents.send as any).mock.calls[0][1];
        expect(payload.courses).toHaveLength(1);
        expect(payload.courses[0].id).toBe('b');
    });
});
