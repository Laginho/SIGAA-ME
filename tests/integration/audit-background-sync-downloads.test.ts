// @vitest-environment jsdom
/**
 * DL-006 (reabertura, achado 1 da revisão de 2026-09-14) — o que o sync em
 * background baixa sozinho precisa entrar no índice `downloads` do renderer,
 * senão o próximo "Baixar todos" não tem `known` para aquele arquivo e o
 * `finalizeDownload` grava uma segunda cópia como `X (1).pdf`.
 *
 * `BackgroundSyncService` guarda o `AppResult` de `downloadAllFiles` (hoje
 * descartado) e, se `success`, embute os registros `downloaded` num campo novo
 * `downloads` do `background-sync-update`. `handleBackgroundSyncUpdate`
 * (dashboard.ts) grava esses registros com a mesma função que
 * `course-detail.ts` usa depois de um download manual — extraída para
 * `src/data/account-storage` como `recordDownloads`.
 *
 * Vermelho hoje pelo motivo certo: o primeiro teste falha porque `downloads`
 * não existe no payload; o terceiro falha porque `recordDownloads` não existe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { SigaaService } from '../../electron/services/sigaa.service';
import type { AppSettings, BackgroundSyncUpdate } from '../../shared/ipc';
import { ok, fail } from '../../shared/errors';

vi.mock('electron', () => ({
    app: { getPath: () => 'test-userdata', getAppPath: () => '.', isPackaged: true },
    BrowserWindow: class {},
    Notification: class {
        static isSupported() { return false; }
        show() {}
    },
}));

vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));

vi.mock('../../electron/services/cache.service', () => ({
    cacheService: {
        getCourseState: vi.fn(() => ({ files: ['old'], news: [] })), // não é cold start
        diffCourseState: vi.fn((_account: string, _course: string, currentFiles: { id: string }[]) => ({
            newFiles: currentFiles.filter(f => f.id !== 'old'),
            newNews: [],
        })),
        updateCourseState: vi.fn(),
    },
}));

const settings: AppSettings = {
    theme: 'light', lastDownloadPath: '/downloads', runInBackground: true,
    syncInterval: 60, autoDownloadUpdates: true, openAtLogin: false,
};

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => settings),
        loadCredentials: vi.fn(() => ({ username: 'aluno01', password: 'p' })),
        updateSetting: vi.fn(),
    },
}));

import { BackgroundSyncService } from '../../electron/services/background-sync.service';
import { SessionOperationCoordinator } from '../../electron/services/session-operation-coordinator.service';
import { deriveAccountId, setActiveAccount as setActiveMainAccount } from '../../electron/services/account-context.service';

function makeWindow() {
    const send = vi.fn();
    return { win: { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow, send };
}

function makeSigaaService(downloadAllFiles: ReturnType<typeof vi.fn>) {
    return {
        operations: new SessionOperationCoordinator(),
        getCourses: vi.fn(async () => ok({ courses: [{ id: 'c1', name: 'Course 1', code: 'C1', period: '2026.1' }] })),
        getCourseFiles: vi.fn(async () => ok({
            files: [{ id: 'old', name: 'old.pdf', type: 'file' }, { id: 'new', name: 'new.pdf', type: 'file' }],
            news: [],
        })),
        login: vi.fn(async () => ok({ id: deriveAccountId('aluno01'), name: 'U' })),
        downloadAllFiles,
        getNewsDetail: vi.fn(),
    } as unknown as SigaaService;
}

async function runSync(service: BackgroundSyncService) {
    const p = service.syncNow();
    await vi.runAllTimersAsync();
    await p;
}

describe('BackgroundSyncService feeds its own downloads back into the renderer index', () => {
    beforeEach(() => {
        setActiveMainAccount(null);
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        setActiveMainAccount(null);
    });

    it('a successful auto-download reports only its downloaded file, with filePath', async () => {
        const accountId = deriveAccountId('aluno01');
        setActiveMainAccount(accountId);
        const { win, send } = makeWindow();
        const downloadAllFiles = vi.fn(async () => ok({
            downloaded: 1,
            skipped: 1,
            failed: 0,
            results: [
                { fileId: 'new', fileName: 'new.pdf', status: 'downloaded' as const, filePath: '/downloads/Course 1/new.pdf' },
                { fileId: 'other', fileName: 'other.pdf', status: 'skipped' as const },
            ],
        }));
        const service = new BackgroundSyncService(makeSigaaService(downloadAllFiles), () => win);

        await runSync(service);

        expect(downloadAllFiles).toHaveBeenCalled();
        const [, payload] = send.mock.calls[0] as [string, BackgroundSyncUpdate];
        expect(payload.downloads).toEqual([
            { courseId: 'c1', records: [{ fileId: 'new', fileName: 'new.pdf', status: 'downloaded', filePath: '/downloads/Course 1/new.pdf' }] },
        ]);
    });

    it('a failed auto-download leaves the course out of downloads and does not throw', async () => {
        const accountId = deriveAccountId('aluno01');
        setActiveMainAccount(accountId);
        const { win, send } = makeWindow();
        const downloadAllFiles = vi.fn(async () => fail('UNKNOWN', 'disk full'));
        const service = new BackgroundSyncService(makeSigaaService(downloadAllFiles), () => win);

        await expect(runSync(service)).resolves.toBeUndefined();

        const [, payload] = send.mock.calls[0] as [string, BackgroundSyncUpdate];
        expect(payload.downloads ?? []).not.toContainEqual(expect.objectContaining({ courseId: 'c1' }));
    });
});

describe('account-storage: recordDownloads', () => {
    beforeEach(async () => {
        localStorage.clear();
        sessionStorage.clear();
        const { setActiveAccount } = await import('../../src/data/account-storage');
        setActiveAccount({ id: 'acc-a', name: 'ALUNO A' });
    });

    it('records a downloaded file into an empty index, and keeps an existing entry from another file', async () => {
        const { readAccountItem, recordDownloads } = await import('../../src/data/account-storage');

        recordDownloads('c1', [{ fileId: 'f1', fileName: 'a.pdf', status: 'downloaded', filePath: '/x/a.pdf' }]);
        let stored = JSON.parse(readAccountItem('downloads') || '{}');
        expect(stored.c1.f1.path).toBe('/x/a.pdf');
        expect(typeof stored.c1.f1.downloadedAt).toBe('number');

        recordDownloads('c1', [
            { fileId: 'f2', fileName: 'b.pdf', status: 'downloaded', filePath: '/x/b.pdf' },
            { fileId: 'f3', fileName: 'c.pdf', status: 'skipped' },
        ]);
        stored = JSON.parse(readAccountItem('downloads') || '{}');
        expect(stored.c1.f1.path).toBe('/x/a.pdf');
        expect(stored.c1.f2.path).toBe('/x/b.pdf');
        expect(stored.c1.f3).toBeUndefined();
    });
});
