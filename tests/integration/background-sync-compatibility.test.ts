/**
 * PORTAL-005 — BackgroundSyncService x PortalCompatibilityService: o gate em
 * `syncNow()` (critério 3) e a contagem de falha estrutural por ciclo do
 * `runSync` (critério 4). Harness copiado de `background-sync.test.ts`; aqui
 * `compatibility` é sempre um duplo passado no construtor, nunca a classe
 * real (essa fica em `tests/unit/portal-compatibility.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SigaaService } from '../../electron/services/sigaa.service';
import type { BrowserWindow } from 'electron';
import type { AppSettings, CompatibilityStatus } from '../../shared/ipc';
import { fail, ok } from '../../shared/errors';

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

vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));

const cacheState = vi.hoisted(() => {
    const baselines = new Map<string, { files: string[]; news: string[] }>();
    return { baselines };
});

vi.mock('../../electron/services/cache.service', () => ({
    cacheService: {
        getCourseState: vi.fn((_accountId: string, courseId: string) => cacheState.baselines.get(courseId) ?? { files: [], news: [] }),
        diffCourseState: vi.fn((_accountId: string, courseId: string, currentFiles: any[], currentNews: any[]) => {
            const baseline = cacheState.baselines.get(courseId) ?? { files: [], news: [] };
            return {
                newFiles: currentFiles.filter(item => item.id && !baseline.files.includes(String(item.id))),
                newNews: currentNews.filter(item => item.id && !baseline.news.includes(String(item.id)))
            };
        }),
        updateCourseState: vi.fn((_accountId: string, courseId: string, files: string[], news: string[]) => {
            cacheState.baselines.set(courseId, { files, news });
        })
    }
}));

const settings: AppSettings = {
    theme: 'light',
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
import { SessionOperationCoordinator } from '../../electron/services/session-operation-coordinator.service';
import { setActiveAccount } from '../../electron/services/account-context.service';

const ACC = 'a'.repeat(64);

function makeWindow() {
    return { isDestroyed: () => false, webContents: { send: vi.fn() } } as unknown as BrowserWindow;
}

function makeCompatibility(initialState: 'ok' | 'incompatible' = 'ok') {
    const incompatibleStatus: CompatibilityStatus = { state: 'incompatible', since: 0, failures: 3, lastCode: 'SELECTOR_DRIFT' };
    return {
        status: vi.fn((): CompatibilityStatus => (initialState === 'ok' ? { state: 'ok' } : incompatibleStatus)),
        recordStructuralFailure: vi.fn(),
        recordSuccess: vi.fn(),
    };
}

function makeSigaaService(overrides: Partial<Record<'getCourses' | 'getCourseFiles' | 'login' | 'downloadAllFiles', any>> = {}) {
    return {
        operations: new SessionOperationCoordinator(),
        getCourses: vi.fn(async () => ok({ courses: [] })),
        getCourseFiles: vi.fn(async () => ok({ files: [], news: [] })),
        login: vi.fn(async () => ok({ id: 'u', name: 'U' })),
        downloadAllFiles: vi.fn(async () => ok({ downloaded: 0, skipped: 0, failed: 0, results: [] })),
        ...overrides
    } as unknown as SigaaService;
}

beforeEach(() => {
    cacheState.baselines.clear();
    setActiveAccount(ACC);
    vi.clearAllMocks();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    setActiveAccount(null);
});

describe('BackgroundSyncService.syncNow — gate de compatibilidade (critério 3)', () => {
    it('estado incompatible pula o ciclo inteiro: sem getCourses, sem login, sem download', async () => {
        const compatibility = makeCompatibility('incompatible');
        const sigaaService = makeSigaaService();
        const service = new BackgroundSyncService(sigaaService, () => makeWindow(), compatibility);

        await service.syncNow();

        expect(sigaaService.getCourses).not.toHaveBeenCalled();
        expect(sigaaService.login).not.toHaveBeenCalled();
        expect(sigaaService.downloadAllFiles).not.toHaveBeenCalled();
    });

    it('estado ok roda o ciclo normalmente, como hoje', async () => {
        const compatibility = makeCompatibility('ok');
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ok({ courses: [{ id: 'c1', name: 'Course 1' }] })),
        });
        const service = new BackgroundSyncService(sigaaService, () => makeWindow(), compatibility);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        expect(sigaaService.getCourses).toHaveBeenCalledTimes(1);
    });
});

describe('BackgroundSyncService.syncNow — contagem por ciclo (critério 4)', () => {
    it('três ciclos com getCourses em SELECTOR_DRIFT chamam recordStructuralFailure três vezes', async () => {
        const compatibility = makeCompatibility('ok');
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => fail('SELECTOR_DRIFT', 'drift')),
        });
        const service = new BackgroundSyncService(sigaaService, () => makeWindow(), compatibility);

        for (let i = 0; i < 3; i++) {
            const p = service.syncNow();
            await vi.runAllTimersAsync();
            await p;
        }

        expect(compatibility.recordStructuralFailure).toHaveBeenCalledTimes(3);
        expect(compatibility.recordSuccess).not.toHaveBeenCalled();
    });

    it('um ciclo com PORTAL_UNAVAILABLE não chama recordStructuralFailure nem recordSuccess', async () => {
        const compatibility = makeCompatibility('ok');
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => fail('PORTAL_UNAVAILABLE', 'timeout')),
        });
        const service = new BackgroundSyncService(sigaaService, () => makeWindow(), compatibility);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        expect(compatibility.recordStructuralFailure).not.toHaveBeenCalled();
        expect(compatibility.recordSuccess).not.toHaveBeenCalled();
    });

    it('um ciclo onde todo getCourseFiles dá SELECTOR_DRIFT conta como falha estrutural', async () => {
        const compatibility = makeCompatibility('ok');
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ok({
                courses: [{ id: 'a', name: 'Course A' }, { id: 'b', name: 'Course B' }]
            })),
            getCourseFiles: vi.fn(async () => fail('SELECTOR_DRIFT', 'drift')),
        });
        const service = new BackgroundSyncService(sigaaService, () => makeWindow(), compatibility);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        expect(compatibility.recordStructuralFailure).toHaveBeenCalledTimes(1);
        expect(compatibility.recordSuccess).not.toHaveBeenCalled();
    });

    it('um ciclo onde só parte das disciplinas sofre drift zera o contador (recordSuccess)', async () => {
        const compatibility = makeCompatibility('ok');
        const sigaaService = makeSigaaService({
            getCourses: vi.fn(async () => ok({
                courses: [{ id: 'a', name: 'Course A' }, { id: 'b', name: 'Course B' }]
            })),
            getCourseFiles: vi.fn(async (courseId: string) => {
                if (courseId === 'a') return fail('SELECTOR_DRIFT', 'drift');
                return ok({ files: [], news: [] });
            }),
        });
        const service = new BackgroundSyncService(sigaaService, () => makeWindow(), compatibility);

        const p = service.syncNow();
        await vi.runAllTimersAsync();
        await p;

        expect(compatibility.recordSuccess).toHaveBeenCalledTimes(1);
        expect(compatibility.recordStructuralFailure).not.toHaveBeenCalled();
    });
});
