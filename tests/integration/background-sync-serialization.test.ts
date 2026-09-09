/**
 * CONC-001 — sync em background e ação do usuário nunca usam a mesma página
 * Playwright ao mesmo tempo.
 *
 * `SigaaService` e `BackgroundSyncService` reais; Playwright e HTTP falsos. O
 * falso do Playwright conta quantas chamadas estão em voo ao mesmo tempo
 * (`inFlight.max`): 2 aqui é exatamente a corrida que o `pauseSync` fingia
 * evitar (`BUG-002`, `DÉBITO-03`). A disciplina em voo fica pendurada num
 * deferred até o teste mandar, para a segunda operação chegar no meio de uma
 * navegação de verdade.
 *
 * Harness dos mocks igual ao de `sigaa-service.test.ts` (Playwright/HTTP) e
 * `background-sync.test.ts` (electron, cache, persistence, timers falsos para a
 * pausa de 2s entre disciplinas).
 *
 * Vermelho hoje pelo motivo certo: nada serializa — a segunda chamada entra
 * na página enquanto a primeira ainda está nela.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { AppSettings } from '../../shared/ipc';

vi.mock('electron', () => ({
    app: { getPath: () => 'test-userdata', getAppPath: () => '.', isPackaged: true },
    BrowserWindow: class {},
    Notification: class {
        static isSupported() { return false; }
        show() {}
    },
}));

// O serviço faz mkdir de verdade antes de baixar (QA-006); nada aqui olha o disco.
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
}));

type Fn = ReturnType<typeof vi.fn>;
type PlaywrightFake = Record<
    'login' | 'logout' | 'close' | 'getCourses' | 'enterCourseAndGetHTML' | 'navigateToFilesSection'
    | 'downloadFile' | 'getNewsDetail' | 'getUserAgent' | 'getCookies',
    Fn
>;
type HttpFake = Record<'setCookies' | 'setUserAgent' | 'resetSession' | 'getCourseFiles' | 'downloadFile', Fn>;

const harness = vi.hoisted(() => {
    const inFlight = { current: 0, max: 0 };
    /** Envolve uma chamada ao "Playwright" e registra o pico de concorrência. */
    async function track<T>(work: () => Promise<T>): Promise<T> {
        inFlight.current++;
        inFlight.max = Math.max(inFlight.max, inFlight.current);
        try {
            return await work();
        } finally {
            inFlight.current--;
        }
    }
    return {
        inFlight,
        track,
        log: [] as string[],
        playwright: null as PlaywrightFake | null,
        http: null as HttpFake | null,
    };
});

vi.mock('../../electron/services/playwright-login.service', () => ({
    PlaywrightLoginService: class {
        login = vi.fn();
        logout = vi.fn(async () => { harness.log.push('pw:logout'); });
        close = vi.fn();
        getCourses = vi.fn();
        enterCourseAndGetHTML = vi.fn();
        navigateToFilesSection = vi.fn();
        downloadFile = vi.fn();
        getNewsDetail = vi.fn();
        getUserAgent = vi.fn(async () => 'mock-ua');
        getCookies = vi.fn(() => []);
        constructor() { harness.playwright = this as unknown as PlaywrightFake; }
    },
}));

vi.mock('../../electron/services/http-scraper.service', () => ({
    HttpScraperService: class {
        setCookies = vi.fn();
        setUserAgent = vi.fn();
        resetSession = vi.fn();
        getCourseFiles = vi.fn();
        downloadFile = vi.fn();
        constructor() { harness.http = this as unknown as HttpFake; }
    },
}));

vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) },
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

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => settings),
        loadCredentials: vi.fn(() => ({ username: 'aluno01', password: 'p' })),
        updateSetting: vi.fn(),
    },
}));

import { SigaaService } from '../../electron/services/sigaa.service';
import { BackgroundSyncService } from '../../electron/services/background-sync.service';
import { setActiveAccount } from '../../electron/services/account-context.service';

const ACC = 'a'.repeat(64);
const COURSES = [
    { id: 'c1', code: 'C1', name: 'Course 1', period: '2026.1' },
    { id: 'c2', code: 'C2', name: 'Course 2', period: '2026.1' },
    { id: 'c3', code: 'C3', name: 'Course 3', period: '2026.1' },
];
type EnterResult = { success: boolean; html?: string; error?: string };
const ENTERED: EnterResult = { success: true, html: '<html></html>' };
const PARSED = {
    success: true,
    files: [{ id: 'old', name: 'old.pdf', type: 'file' }, { id: 'new', name: 'new.pdf', type: 'file' }],
    news: [],
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => { resolve = res; });
    return { promise, resolve };
}

function makeWindow() {
    const send = vi.fn();
    return { win: { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow, send };
}

/**
 * `enterCourseAndGetHTML` fica pendurado só para `heldCourseId`; as demais
 * disciplinas entram na hora. Tudo passa por `track`, e cada saída vai para o log.
 */
function holdCourse(heldCourseId: string) {
    const gate = deferred<EnterResult>();
    harness.playwright!.enterCourseAndGetHTML.mockImplementation((courseId: string) =>
        harness.track(async () => {
            const result = courseId === heldCourseId ? await gate.promise : ENTERED;
            harness.log.push(`enter:${courseId}:done`);
            return result;
        }),
    );
    return { release: () => gate.resolve(ENTERED) };
}

describe('Background sync and user actions share one Playwright session (CONC-001)', () => {
    let service: SigaaService;
    let sync: BackgroundSyncService;
    let send: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        harness.inFlight.current = 0;
        harness.inFlight.max = 0;
        harness.log.length = 0;
        cacheCalls.updateCourseState.length = 0;
        setActiveAccount(ACC);
        vi.useFakeTimers();

        service = new SigaaService();
        const window = makeWindow();
        send = window.send;
        sync = new BackgroundSyncService(service, () => window.win);

        harness.playwright!.getCourses.mockImplementation(() =>
            harness.track(async () => ({ success: true, courses: COURSES })),
        );
        harness.playwright!.enterCourseAndGetHTML.mockImplementation(() => harness.track(async () => ENTERED));
        harness.http!.getCourseFiles.mockResolvedValue(PARSED);
    });

    afterEach(() => {
        vi.useRealTimers();
        setActiveAccount(null);
    });

    it('the sync alone completes: its own calls into SigaaService run inside the background operation without deadlocking', async () => {
        const run = sync.syncNow();
        await vi.runAllTimersAsync();

        // Sem `await run` antes: uma implementação que trava esperando por si
        // mesma deixaria o teste pendurado até o timeout de 30s.
        expect(send).toHaveBeenCalledTimes(1);
        expect(harness.playwright!.enterCourseAndGetHTML).toHaveBeenCalledTimes(COURSES.length);
        expect(harness.inFlight.max).toBe(1);
        await run;
    });

    it('a course opened by the user while a sync is in flight waits for the current course; the sync then stops without publishing', async () => {
        const held = holdCourse('c1');

        const run = sync.syncNow();
        await vi.runAllTimersAsync();
        expect(harness.playwright!.enterCourseAndGetHTML).toHaveBeenCalledTimes(1);

        const user = service.getCourseFiles('c9', 'Mine');
        await vi.advanceTimersByTimeAsync(0);
        // O usuário não entra na página enquanto o sync ainda está nela.
        expect(harness.playwright!.enterCourseAndGetHTML).toHaveBeenCalledTimes(1);

        held.release();
        await vi.runAllTimersAsync();
        const result = await user;
        await run;

        expect(result.success).toBe(true);
        expect(harness.playwright!.enterCourseAndGetHTML.mock.calls.map(call => call[0])).toEqual(['c1', 'c9']);
        expect(harness.inFlight.max).toBe(1);
        // Varredura cancelada não publica dado parcial como sync completo.
        expect(send).not.toHaveBeenCalled();
        expect(cacheCalls.updateCourseState).toEqual([]);
    });

    it('a sync that fires while the user is inside a course waits for that operation instead of sharing the page', async () => {
        const held = holdCourse('c9');

        const user = service.getCourseFiles('c9', 'Mine');
        await vi.advanceTimersByTimeAsync(0);
        const run = sync.syncNow();
        await vi.advanceTimersByTimeAsync(10_000);

        expect(harness.playwright!.getCourses).not.toHaveBeenCalled();

        held.release();
        await vi.runAllTimersAsync();
        await user;
        await run;

        expect(harness.playwright!.getCourses).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledTimes(1);
        expect(harness.inFlight.max).toBe(1);
    });

    it('logout during a sync waits for the course in flight before the browser is closed, and the run publishes nothing', async () => {
        const held = holdCourse('c1');

        const run = sync.syncNow();
        await vi.runAllTimersAsync();

        const logout = service.logout();
        await vi.advanceTimersByTimeAsync(0);
        expect(harness.playwright!.logout).not.toHaveBeenCalled();

        held.release();
        await vi.runAllTimersAsync();
        await logout;
        await run;

        expect(harness.playwright!.logout).toHaveBeenCalledTimes(1);
        expect(harness.log.indexOf('pw:logout')).toBeGreaterThan(harness.log.indexOf('enter:c1:done'));
        expect(harness.playwright!.enterCourseAndGetHTML).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
        expect(cacheCalls.updateCourseState).toEqual([]);
    });

    it('BackgroundSyncService.cancel() still drains the run through the coordinator (DATA-002 contract kept)', async () => {
        const held = holdCourse('c1');

        const run = sync.syncNow();
        await vi.runAllTimersAsync();

        let settled = false;
        const cancelled = sync.cancel().then(() => { settled = true; });
        await vi.advanceTimersByTimeAsync(10_000);
        expect(settled).toBe(false);

        held.release();
        await vi.runAllTimersAsync();
        await Promise.all([run, cancelled]);

        expect(settled).toBe(true);
        expect(harness.playwright!.enterCourseAndGetHTML).toHaveBeenCalledTimes(1);
        expect(send).not.toHaveBeenCalled();
    });
});
