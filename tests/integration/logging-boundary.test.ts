/**
 * OBS-004 — fronteira do log no pipeline de scraping.
 *
 * `logger.service` NÃO é mockado aqui — é o próprio ponto do teste. `electron`
 * aponta `app.getPath('userData')` para uma pasta temporária e `isPackaged:
 * true` (produção, como o app de verdade), e os quatro serviços
 * (`HttpScraperService`, `DownloadService` via o plano B do `SigaaService`, e
 * `BackgroundSyncService`) escrevem no singleton real. Cada cenário prova que
 * **algo** foi logado no escopo do componente — um logger mudo passa no
 * negativo e falha no positivo — e que nome de disciplina/arquivo/notícia,
 * caminho e cookie nunca chegam ao arquivo.
 *
 * `SigaaService.downloadFile` cai no plano B (`httpScraper.getCourseFiles`
 * devolve `files: []`, sem script casando) até `PlaywrightLoginService`
 * mockado — só a navegação — cujo `downloadFile` entrega uma `Page` falsa
 * (padrão de `download-boundary.test.ts`) ao `DownloadService` real.
 *
 * `BackgroundSyncService.syncNow` roda com timers reais (o ciclo dorme 2s por
 * disciplina, 1,5s por notícia nova) — por isso os testes desse bloco têm
 * timeout maior.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import type { Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
    app: {
        isPackaged: true,
        getPath: () => env.userData,
        getAppPath: () => '.',
    },
    BrowserWindow: class { },
    Notification: class {
        static isSupported() { return false; }
        show() { }
    },
}));

vi.mock('axios', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));

const cacheState = vi.hoisted(() => ({
    baselines: new Map<string, { files: string[]; news: string[] }>(),
}));

vi.mock('../../electron/services/cache.service', () => ({
    cacheService: {
        getCourseState: vi.fn((_accountId: string, courseId: string) =>
            cacheState.baselines.get(courseId) ?? { files: [], news: [] }),
        diffCourseState: vi.fn((_accountId: string, courseId: string, files: any[], news: any[]) => {
            const baseline = cacheState.baselines.get(courseId) ?? { files: [], news: [] };
            return {
                newFiles: files.filter(f => f.id && !baseline.files.includes(String(f.id))),
                newNews: news.filter(n => n.id && !baseline.news.includes(String(n.id))),
            };
        }),
        updateCourseState: vi.fn((_accountId: string, courseId: string, files: string[], news: string[]) => {
            cacheState.baselines.set(courseId, { files, news });
        }),
    }
}));

const SETTINGS = vi.hoisted(() => ({
    theme: 'light',
    autoSync: true,
    lastDownloadPath: null as string | null,
    runInBackground: true,
    syncInterval: 60,
    autoDownloadUpdates: false,
    openAtLogin: false,
}));

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => SETTINGS),
        loadCredentials: vi.fn(() => ({ username: 'aluno-de-teste', password: 'x' })),
        updateSetting: vi.fn(),
    }
}));

import axios from 'axios';
import { ok, fail } from '../../shared/errors';
import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { DownloadService } from '../../electron/services/download.service';
import { SigaaService } from '../../electron/services/sigaa.service';
import { BackgroundSyncService } from '../../electron/services/background-sync.service';
import { SessionOperationCoordinator } from '../../electron/services/session-operation-coordinator.service';
import { setActiveAccount } from '../../electron/services/account-context.service';
import { logger } from '../../electron/services/logger.service';

const fixture = (name: string) =>
    readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8');

const DOWNLOAD_SCRIPT =
    "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,555','');";

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

function readLog(): string {
    try {
        return readFileSync(path.join(env.userData, 'logs', 'app.log'), 'utf8');
    } catch {
        return '';
    }
}

/** Página falsa no padrão de `download-boundary.test.ts`: só o que o ramo "download" toca. */
function fakePage(body: Buffer | string, suggestedFilename: string) {
    const saveAs = vi.fn(async (p: string) => { writeFileSync(p, body); });
    const download = { suggestedFilename: () => suggestedFilename, saveAs };
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async () => { }),
        unroute: vi.fn(async () => { }),
        waitForEvent: (name: string) =>
            name === 'download' ? Promise.resolve(download) : new Promise(() => { }),
        evaluate: vi.fn(async () => null),
    };
    return page as unknown as Page;
}

beforeAll(() => {
    env.userData = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-logging-boundary-userdata-'));
});

afterAll(() => {
    rmSync(env.userData, { recursive: true, force: true });
});

beforeEach(async () => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    cacheState.baselines.clear();
    SETTINGS.autoDownloadUpdates = false;
    SETTINGS.lastDownloadPath = null;
    await logger.clear();
});

describe('HttpScraperService', () => {
    let scraper: HttpScraperService;

    beforeEach(() => {
        scraper = new HttpScraperService();
        scraper.setCookies([{ name: 'JSESSIONID', value: 'SEGREDO123', domain: 'si3.ufc.br' }]);
    });

    it('getCourseFiles com fixture loga no escopo HttpScraper', async () => {
        const result = await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));

        expect(result.success).toBe(true);
        await logger.flush();
        expect(readLog()).toContain('[HttpScraper]');
    });

    it('uma falha de rede com cookie de sessão no AxiosError nunca grava o cookie', async () => {
        const axiosError = Object.assign(new Error('Request failed with status code 500'), {
            isAxiosError: true,
            config: { headers: { Cookie: 'JSESSIONID=SEGREDO123' } },
        });
        vi.mocked(axios.get).mockRejectedValue(axiosError);

        const result = await scraper.getCourseFiles('99999', 'Cálculo I');

        expect(result.success).toBe(false);
        await logger.flush();
        const log = readLog();
        expect(log).toContain('[HttpScraper]');
        expect(log).not.toContain('SEGREDO123');
        expect(log).not.toContain('config');
    });

    it('downloadFile HTTP loga no escopo HttpScraper, sem o nome do arquivo', async () => {
        await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));
        vi.mocked(axios.post).mockResolvedValue({
            headers: { 'content-type': 'application/pdf', 'content-length': String(PDF_MINIMO.length) },
            data: Readable.from([PDF_MINIMO]),
        });
        const destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-logging-boundary-download-'));

        try {
            const result = await scraper.downloadFile('99999', '555', 'Lista 3.pdf', destino, DOWNLOAD_SCRIPT);

            expect(result.success).toBe(true);
            await logger.flush();
            const log = readLog();
            expect(log).toContain('[HttpScraper]');
            expect(log).not.toContain('Lista 3.pdf');
        } finally {
            rmSync(destino, { recursive: true, force: true });
        }
    });
});

describe('SigaaService.downloadFile — plano B via DownloadService', () => {
    it('loga no escopo Download, sem o nome do arquivo nem o caminho', async () => {
        const service = new SigaaService();
        const fileName = 'Lista 3.pdf';
        const destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-logging-boundary-planb-'));
        const page = fakePage(PDF_MINIMO, 'download.html');

        (service as any).httpScraper = {
            setCookies: vi.fn(),
            setUserAgent: vi.fn(),
            resetSession: vi.fn(),
            getCourseFiles: vi.fn(async () => ({ success: true, files: [] })), // sem script -> plano B
        };
        (service as any).playwrightLogin = {
            enterCourseAndGetHTML: vi.fn(async () => ({ success: true, html: '<html></html>', cookies: [] })),
            navigateToFilesSection: vi.fn(async () => ({ success: false })),
            getUserAgent: vi.fn(async () => 'ua-de-teste'),
            downloadFile: vi.fn(async (_courseId: string, courseName: string, name: string, _fileUrl: string, basePath: string) =>
                new DownloadService(null).downloadFile(page, '', name, courseName, basePath, DOWNLOAD_SCRIPT)),
        };

        try {
            const result = await service.downloadFile('c1', 'Cálculo I', { id: '999', name: fileName }, destino);

            expect(result.success).toBe(true);
            await logger.flush();
            const log = readLog();
            expect(log).toContain('[Download]');
            expect(log).not.toContain(fileName);
            expect(log).not.toContain(destino);
            expect(log).not.toContain('Cálculo I');
        } finally {
            rmSync(destino, { recursive: true, force: true });
        }
    });
});

describe('BackgroundSyncService.syncNow', () => {
    const ACC = 'a'.repeat(64);

    beforeEach(() => {
        setActiveAccount(ACC);
    });

    afterEach(() => {
        setActiveAccount(null);
    });

    function makeSigaaService(overrides: Record<string, any> = {}) {
        return {
            operations: new SessionOperationCoordinator(),
            getCourses: vi.fn(async () => ok({ courses: [{ id: 'c1', name: 'Cálculo I' }] })),
            getCourseFiles: vi.fn(async () => ok({ files: [], news: [] })),
            login: vi.fn(async () => ok({ id: 'u', name: 'U' })),
            downloadAllFiles: vi.fn(async () => ok({ downloaded: 0, skipped: 0, failed: 0, results: [] })),
            getNewsDetail: vi.fn(async () => fail('UNKNOWN', 'x')),
            ...overrides,
        } as unknown as SigaaService;
    }

    it('cold start loga no escopo BackgroundSync, sem o nome da disciplina', async () => {
        const sigaaService = makeSigaaService({
            getCourseFiles: vi.fn(async () => ok({ files: [{ id: '1', name: 'f1.pdf' }], news: [] })),
        });
        const service = new BackgroundSyncService(sigaaService, () => null);

        await service.syncNow();

        await logger.flush();
        const log = readLog();
        expect(log).toContain('[BackgroundSync]');
        expect(log).not.toContain('Cálculo I');
    }, 10000);

    it('uma notícia nova com auto-download chama getNewsDetail e loga sem o título', async () => {
        cacheState.baselines.set('c1', { files: ['1'], news: [] });
        SETTINGS.autoDownloadUpdates = true;
        const getNewsDetail = vi.fn(async () => ok({ title: 'Prova Remarcada', date: '10/04/2026', notification: '', content: 'conteúdo de teste' }));
        const sigaaService = makeSigaaService({
            getCourseFiles: vi.fn(async () => ok({
                files: [{ id: '1', name: 'f1.pdf' }],
                news: [{ id: '777', title: 'Prova Remarcada' }],
            })),
            getNewsDetail,
        });
        const service = new BackgroundSyncService(sigaaService, () => null);

        await service.syncNow();

        expect(getNewsDetail).toHaveBeenCalledTimes(1);
        await logger.flush();
        const log = readLog();
        expect(log).toContain('[BackgroundSync]');
        expect(log).not.toContain('Prova Remarcada');
    }, 10000);
});
