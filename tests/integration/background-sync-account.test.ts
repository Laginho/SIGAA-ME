/**
 * DATA-001 — o sync em background carimba o evento com a conta ativa e grava a
 * linha de base no balde dessa conta.
 *
 * `BackgroundSyncService` já depende dos singletons `persistenceService` e
 * `cacheService`; passa a ler também `getActiveAccount()` de
 * `account-context.service.ts` (módulo real aqui — puro, sem Electron). A conta
 * ativa é definida por `SigaaService.login`, o único ponto por onde passam
 * login manual, auto-login e o re-login do próprio sync.
 *
 * Sem conta ativa não há como atribuir o resultado a ninguém: nada é enviado
 * ao renderer e nada é gravado no cache.
 *
 * Vermelho hoje pelo motivo certo: `account-context.service.ts` não existe.
 * Depois, `payload.accountId` é `undefined` e `updateCourseState` recebe o
 * courseId onde deveria vir o accountId.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { SigaaService } from '../../electron/services/sigaa.service';
import type { AppSettings } from '../../shared/ipc';
import { ok } from '../../shared/errors';

vi.mock('electron', () => ({
    app: { getPath: () => 'test-userdata', getAppPath: () => '.', isPackaged: true },
    BrowserWindow: class {},
    Notification: class {
        static isSupported() { return false; }
        show() {}
    },
}));

const cacheCalls = vi.hoisted(() => ({
    getCourseState: [] as unknown[][],
    diffCourseState: [] as unknown[][],
    updateCourseState: [] as unknown[][],
}));

vi.mock('../../electron/services/cache.service', () => ({
    cacheService: {
        getCourseState: vi.fn((...args: unknown[]) => {
            cacheCalls.getCourseState.push(args);
            return { files: ['old'], news: [] }; // não é cold start: há linha de base
        }),
        diffCourseState: vi.fn((...args: unknown[]) => {
            cacheCalls.diffCourseState.push(args);
            const [, , currentFiles] = args as [string, string, { id: string }[], unknown[]];
            return { newFiles: currentFiles.filter(f => f.id !== 'old'), newNews: [] };
        }),
        updateCourseState: vi.fn((...args: unknown[]) => {
            cacheCalls.updateCourseState.push(args);
        }),
    },
}));

const settings: AppSettings = {
    theme: 'light', autoSync: true, lastDownloadPath: null, runInBackground: true,
    syncInterval: 60, autoDownloadUpdates: false, openAtLogin: false,
};

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => settings),
        loadCredentials: vi.fn(() => ({ username: 'aluno01', password: 'p' })),
        updateSetting: vi.fn(),
    },
}));

import { BackgroundSyncService } from '../../electron/services/background-sync.service';
import { deriveAccountId, setActiveAccount } from '../../electron/services/account-context.service';

function makeWindow() {
    const send = vi.fn();
    return { win: { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow, send };
}

function makeSigaaService() {
    return {
        getCourses: vi.fn(async () => ok({ courses: [{ id: 'c1', name: 'Course 1', code: 'C1', period: '2026.1' }] })),
        getCourseFiles: vi.fn(async () => ok({ files: [{ id: 'old', name: 'old.pdf', type: 'file' }, { id: 'new', name: 'new.pdf', type: 'file' }], news: [] })),
        login: vi.fn(async () => ok({ id: deriveAccountId('aluno01'), name: 'U' })),
        downloadAllFiles: vi.fn(),
        getNewsDetail: vi.fn(),
    } as unknown as SigaaService;
}

async function runSync(service: BackgroundSyncService) {
    const p = service.syncNow();
    await vi.runAllTimersAsync();
    await p;
}

describe('BackgroundSyncService and the active account', () => {
    beforeEach(() => {
        cacheCalls.getCourseState.length = 0;
        cacheCalls.diffCourseState.length = 0;
        cacheCalls.updateCourseState.length = 0;
        setActiveAccount(null);
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        setActiveAccount(null);
    });

    it('tags the renderer update with the active account id and reads/writes that account bucket', async () => {
        const accountId = deriveAccountId('aluno01');
        setActiveAccount(accountId);
        const { win, send } = makeWindow();
        const service = new BackgroundSyncService(makeSigaaService(), () => win);

        await runSync(service);

        expect(send).toHaveBeenCalledTimes(1);
        const [channel, payload] = send.mock.calls[0] as [string, { accountId?: string; courses: unknown[]; notifications: unknown[] }];
        expect(channel).toBe('background-sync-update');
        expect(payload.accountId).toBe(accountId);
        expect(payload.courses).toHaveLength(1);
        expect(payload.notifications).toHaveLength(1);

        expect(cacheCalls.getCourseState.length).toBeGreaterThan(0);
        for (const call of [...cacheCalls.getCourseState, ...cacheCalls.diffCourseState, ...cacheCalls.updateCourseState]) {
            expect(call[0]).toBe(accountId);
            expect(call[1]).toBe('c1');
        }
        expect(cacheCalls.updateCourseState).toHaveLength(1);
    });

    it('without an active account it sends nothing and commits nothing — the result cannot be attributed', async () => {
        const { win, send } = makeWindow();
        const sigaa = makeSigaaService();
        const service = new BackgroundSyncService(sigaa, () => win);

        await runSync(service);

        expect(sigaa.getCourses).toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
        expect(cacheCalls.updateCourseState).toHaveLength(0);
    });
});
