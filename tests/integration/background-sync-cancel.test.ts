/**
 * DATA-002 — `BackgroundSyncService.cancel()`: a fronteira segura mínima que
 * logout e clear-all aguardam antes de fechar a sessão e apagar o disco.
 *
 * É uma flag, não um `AbortSignal` (decisão 1 da issue): o loop a confere
 * antes de cada disciplina e antes de publicar. Um sync cancelado não busca
 * mais nenhuma disciplina, não manda `background-sync-update`, não commita a
 * linha de base nem grava `lastBackgroundSync`. O `CONC-001` troca a flag pelo
 * coordenador e mantém estes testes verdes.
 *
 * Harness igual ao de `background-sync.test.ts` (electron, cache e persistence
 * mockados, timers falsos para o `setTimeout` de 2s entre disciplinas). A
 * disciplina em voo é um `getCourseFiles` que só resolve quando o teste manda,
 * para o `cancel()` chegar no meio de uma disciplina de verdade.
 *
 * Vermelho hoje pelo motivo certo: `cancel` não existe em `BackgroundSyncService`.
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

const cacheCalls = vi.hoisted(() => ({ updateCourseState: [] as unknown[][] }));

vi.mock('../../electron/services/cache.service', () => ({
    cacheService: {
        getCourseState: vi.fn(() => ({ files: ['old'], news: [] })),
        diffCourseState: vi.fn((_a: string, _c: string, currentFiles: { id: string }[]) => ({
            newFiles: currentFiles.filter(f => f.id !== 'old'),
            newNews: [],
        })),
        updateCourseState: vi.fn((...args: unknown[]) => { cacheCalls.updateCourseState.push(args); }),
    },
}));

const settings: AppSettings = {
    theme: 'light', autoSync: true, lastDownloadPath: null, runInBackground: true,
    syncInterval: 60, autoDownloadUpdates: false, openAtLogin: false,
};

const persistenceMock = vi.hoisted(() => ({
    getSettings: vi.fn(),
    loadCredentials: vi.fn(),
    updateSetting: vi.fn(),
}));

vi.mock('../../electron/services/persistence.service', () => ({ persistenceService: persistenceMock }));

import { BackgroundSyncService } from '../../electron/services/background-sync.service';
import { setActiveAccount } from '../../electron/services/account-context.service';

const ACC = 'a'.repeat(64);
const COURSES = [
    { id: 'c1', name: 'Course 1', code: 'C1', period: '2026.1' },
    { id: 'c2', name: 'Course 2', code: 'C2', period: '2026.1' },
    { id: 'c3', name: 'Course 3', code: 'C3', period: '2026.1' },
];
const FILES = ok({ files: [{ id: 'old', name: 'old.pdf', type: 'file' }, { id: 'new', name: 'new.pdf', type: 'file' }], news: [] });

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
}

function makeWindow() {
    const send = vi.fn();
    return { win: { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow, send };
}

/** `getCourseFiles` da primeira disciplina fica pendurado até `release()`. */
function makeSigaaService() {
    const first = deferred<typeof FILES>();
    const getCourseFiles = vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementation(async () => FILES);
    const sigaa = {
        getCourses: vi.fn(async () => ok({ courses: COURSES })),
        getCourseFiles,
        login: vi.fn(async () => ok({ id: ACC, name: 'U' })),
        downloadAllFiles: vi.fn(),
        getNewsDetail: vi.fn(),
    } as unknown as SigaaService;
    return { sigaa, getCourseFiles, release: () => first.resolve(FILES) };
}

/**
 * Deixa o sync chegar ao `getCourseFiles` da primeira disciplina: só existe um
 * timer (a pausa de 2s), e depois dele o loop fica pendurado no deferred.
 *
 * Devolve `{ run }`, não `run`: `return promise` numa função `async` achata a
 * promise, e o `await` de quem chama esperaria o sync inteiro terminar.
 */
async function startAndReachFirstCourse(service: BackgroundSyncService, getCourseFiles: ReturnType<typeof vi.fn>) {
    const run = service.syncNow();
    await vi.runAllTimersAsync();
    expect(getCourseFiles).toHaveBeenCalledTimes(1);
    return { run };
}

describe('BackgroundSyncService.cancel()', () => {
    beforeEach(() => {
        cacheCalls.updateCourseState.length = 0;
        vi.clearAllMocks();
        persistenceMock.getSettings.mockReturnValue(settings);
        persistenceMock.loadCredentials.mockReturnValue({ username: 'aluno01', password: 'p' });
        setActiveAccount(ACC);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        setActiveAccount(null);
    });

    it('a run cancelled mid-course fetches no further course, publishes nothing and commits nothing', async () => {
        const { win, send } = makeWindow();
        const { sigaa, getCourseFiles, release } = makeSigaaService();
        const service = new BackgroundSyncService(sigaa, () => win);

        const { run } = await startAndReachFirstCourse(service, getCourseFiles);
        const cancelled = service.cancel();
        release();
        await vi.runAllTimersAsync();
        await Promise.all([run, cancelled]);

        expect(getCourseFiles).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
        expect(cacheCalls.updateCourseState).toEqual([]);
        expect(persistenceMock.updateSetting).not.toHaveBeenCalledWith('lastBackgroundSync', expect.anything());
    });

    it('cancel() resolves only once the in-flight run has stopped', async () => {
        const { win } = makeWindow();
        const { sigaa, getCourseFiles, release } = makeSigaaService();
        const service = new BackgroundSyncService(sigaa, () => win);

        const { run } = await startAndReachFirstCourse(service, getCourseFiles);
        let settled = false;
        const cancelled = service.cancel().then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(10_000);

        // A disciplina em voo ainda não respondeu: o cancel não pode ter
        // resolvido, senão logout/clear-all fechariam o navegador por baixo dela.
        expect(settled).toBe(false);

        release();
        await vi.runAllTimersAsync();
        await Promise.all([run, cancelled]);
        expect(settled).toBe(true);
    });

    it('cancel() with nothing running resolves at once', async () => {
        const { win } = makeWindow();
        const { sigaa } = makeSigaaService();
        const service = new BackgroundSyncService(sigaa, () => win);

        let settled = false;
        const cancelled = service.cancel().then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(0);

        expect(settled).toBe(true);
        await cancelled;
    });

    it('the flag does not leak: after a cancelled run (or an idle cancel) the next syncNow runs to completion', async () => {
        const { win, send } = makeWindow();
        const { sigaa, getCourseFiles, release } = makeSigaaService();
        const service = new BackgroundSyncService(sigaa, () => win);

        const { run } = await startAndReachFirstCourse(service, getCourseFiles);
        const cancelled = service.cancel();
        release();
        await vi.runAllTimersAsync();
        await Promise.all([run, cancelled]);
        await service.cancel(); // ocioso: também não pode envenenar o próximo
        expect(send).not.toHaveBeenCalled();

        const second = service.syncNow();
        await vi.runAllTimersAsync();
        await second;

        expect(send).toHaveBeenCalledTimes(1);
        expect(getCourseFiles).toHaveBeenCalledTimes(1 + COURSES.length);
        expect(cacheCalls.updateCourseState).toHaveLength(COURSES.length);
    });
});
