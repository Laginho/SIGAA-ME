import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Download, Page, Route } from 'playwright';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { DownloadService } from '../../electron/services/download.service';

let destination: string;
beforeEach(() => {
    destination = mkdtempSync(path.join(os.tmpdir(), 'sigaa-route-failure-'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    rmSync(destination, { recursive: true, force: true });
});

function fakePage() {
    let handler: ((route: Route) => Promise<void>) | undefined;
    let resolveDownload: ((download: Download) => void) | undefined;
    const pendingWaits: Array<(error: Error) => void> = [];
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async (_pattern: string, callback: typeof handler) => { handler = callback; }),
        unroute: vi.fn(async () => {}),
        evaluate: vi.fn(async () => null),
        waitForEvent: vi.fn((name: string) => new Promise((resolve, reject) => {
            pendingWaits.push(reject);
            if (name === 'download') resolveDownload = resolve;
        })),
    };
    return {
        page: page as unknown as Page,
        intercept: (route: Route) => handler!(route),
        download: (download: Download) => resolveDownload!(download),
        close: () => pendingWaits.forEach(reject => reject(new Error('Target page has been closed'))),
    };
}

it.each([
    ['fetch', false], ['fetch', true], ['fulfill', false], ['fulfill', true],
] as const)('falha em route.%s é devolvida sem timeout ou rejeição global (abort falha: %s)', async (stage, abortFails) => {
    const browser = fakePage();
    const originalError = new Error(`route.${stage}: connection reset`);
    const route = {
        fetch: vi.fn(async () => {
            if (stage === 'fetch') throw originalError;
            return { headers: () => ({ 'content-type': 'application/pdf' }) };
        }),
        fulfill: vi.fn(async () => { throw originalError; }),
        abort: vi.fn(async () => {
            if (abortFails) throw new Error('Target page has been closed');
        }),
    };
    let result: Awaited<ReturnType<DownloadService['downloadFile']>> | undefined;
    const operation = new DownloadService().downloadFile(
        browser.page, 'aula.pdf', 'Matemática', destination, '10', 'jsfcljs();',
    ).then(value => { result = value; });
    await new Promise(resolve => setImmediate(resolve));

    // Playwright despacha o callback independentemente de evaluate(). Observar
    // sua rejeição aqui permite provar o defeito sem gerar erro global no teste.
    let callbackError: unknown;
    await browser.intercept(route as unknown as Route).catch(error => { callbackError = error; });
    await new Promise(resolve => setImmediate(resolve));

    expect.soft(callbackError).toBeUndefined();
    expect.soft(route.abort).toHaveBeenCalledTimes(1);
    expect.soft(result).toEqual({ success: false, error: originalError.message });

    // Encerramento posterior rejeita as esperas restantes; não pode vazar uma
    // rejeição nem trocar o erro original pelo erro de fechamento.
    browser.close();
    await operation;
    await new Promise(resolve => setImmediate(resolve));
    expect(result).toEqual({ success: false, error: originalError.message });
});

it('interceptação bem-sucedida preserva o tipo real e salva o PDF', async () => {
    const browser = fakePage();
    const response = { headers: () => ({ 'content-type': 'application/pdf; charset=binary' }) };
    const route = {
        fetch: vi.fn(async () => response),
        fulfill: vi.fn(async () => {}),
        abort: vi.fn(async () => {}),
    };
    const operation = new DownloadService().downloadFile(
        browser.page, 'aula.pdf', 'Matemática', destination, '10', 'jsfcljs();',
    );
    await new Promise(resolve => setImmediate(resolve));
    await browser.intercept(route as unknown as Route);
    browser.download({
        suggestedFilename: () => 'aula.html',
        saveAs: async (target: string) => { writeFileSync(target, '%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'); },
    } as unknown as Download);
    const result = await operation;
    expect(result).toEqual({ success: true, filePath: path.join(destination, 'Matemática', 'aula.pdf') });
    expect(existsSync(result.filePath!)).toBe(true);
    expect(route.fulfill).toHaveBeenCalledWith({ response });
    expect(route.abort).not.toHaveBeenCalled();
    browser.close();
    await new Promise(resolve => setImmediate(resolve));
});
