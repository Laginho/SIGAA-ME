/**
 * DL-010 — achado 2 da auditoria `docs/audits/2026-09-19-e3d29e6.md`: no
 * caminho de reload do popup (`download.service.ts`, bloco `try` que chama
 * `popup.reload()`), o Chrome real aborta a navegação com `ERR_ABORTED`
 * quando o próprio reload dispara o download — e `await popup.reload()`
 * rejeita antes de o código chegar a `await reloadDownloadPromise`. O `catch`
 * fecha o popup e devolve falha mesmo quando o download aconteceu.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { DownloadService } from '../../electron/services/download.service';
import { resolveDownloadTarget } from '../../electron/services/download-path';

const COURSE = 'Cálculo I';
const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

let destino: string;
beforeEach(() => { destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-popup-reload-')); });
afterEach(() => { rmSync(destino, { recursive: true, force: true }); });

function fakePopupPage(events: string[], downloadAfterReload: 'resolve' | 'timeout') {
    let downloadCalls = 0;
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/download.jsf',
        route: vi.fn(async () => {}),
        unroute: vi.fn(async () => {}),
        reload: vi.fn(async () => {
            events.push('reload');
            throw new Error('page.reload: net::ERR_ABORTED');
        }),
        waitForEvent: (_name: string, opts?: { timeout: number }) => {
            downloadCalls += 1;
            if (downloadCalls === 1) {
                // Primeira espera (antes da interceptação), sempre expira: é
                // o que empurra o fluxo para o bloco de reload.
                events.push(`download-timeout-${opts?.timeout}`);
                return Promise.reject(new Error(`Timeout ${opts?.timeout}ms exceeded while waiting for event "download"`));
            }
            if (downloadAfterReload === 'resolve') {
                events.push('download-after-reload-resolve');
                return Promise.resolve({
                    suggestedFilename: () => 'aula.pdf',
                    saveAs: vi.fn(async (p: string) => {
                        events.push('saveAs');
                        writeFileSync(p, PDF_MINIMO);
                    }),
                });
            }
            events.push('download-after-reload-timeout');
            return Promise.reject(new Error(`Timeout ${opts?.timeout}ms exceeded while waiting for event "download"`));
        },
        close: vi.fn(async () => { events.push('close'); }),
    };
    return page;
}

function fakePopupPageSlowReload(events: string[]) {
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/download.jsf',
        route: vi.fn(async () => {}),
        unroute: vi.fn(async () => {}),
        reload: vi.fn(() => new Promise<void>((resolve) => {
            events.push('reload-called');
            // Reload real que demora mais que os 15s do `waitForEvent`: só
            // resolve depois que a espera pelo download já rejeitou.
            setImmediate(() => {
                events.push('reload-resolve');
                resolve();
            });
        })),
        waitForEvent: (_name: string, opts?: { timeout: number }) => {
            events.push(`download-timeout-${opts?.timeout}`);
            return Promise.reject(new Error(`Timeout ${opts?.timeout}ms exceeded while waiting for event "download"`));
        },
        close: vi.fn(async () => { events.push('close'); }),
    };
    return page;
}

function fakeMainPage(popup: unknown) {
    return {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async () => {}),
        evaluate: vi.fn(async () => null),
        waitForEvent: (name: string) => {
            if (name === 'popup') return Promise.resolve(popup);
            return new Promise(() => {}); // nunca resolve: o download principal não é exercido aqui
        },
    } as unknown as Page;
}

it('download que chega durante o reload do popup (que rejeita com ERR_ABORTED) ainda é salvo (critério 1)', async () => {
    const events: string[] = [];
    const popup = fakePopupPage(events, 'resolve');
    const page = fakeMainPage(popup);

    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aula.pdf');
    const result = await new DownloadService().downloadFile(page, 'aula.pdf', COURSE, destino, '10', 'jsfcljs();');

    expect(result).toMatchObject({ success: true, filePath: fullPath });
    expect(existsSync(fullPath)).toBe(true);
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(events.indexOf('saveAs')).toBeLessThan(events.indexOf('close'));
});

it('reload que rejeita e nenhum download chega depois continua devolvendo falha, sem sobra de .part (critério 2)', async () => {
    const events: string[] = [];
    const popup = fakePopupPage(events, 'timeout');
    const page = fakeMainPage(popup);

    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aula.pdf');
    const result = await new DownloadService().downloadFile(page, 'aula.pdf', COURSE, destino, '10', 'jsfcljs();');

    expect(result).toMatchObject({ success: false, error: 'Could not force download from popup' });
    expect(existsSync(fullPath)).toBe(false);
    expect(existsSync(fullPath + '.part')).toBe(false);
    expect(popup.close).toHaveBeenCalledTimes(1);

    // Sem handler de rejeição não tratada por causa do reload/download que rejeitaram.
    await new Promise(resolve => setImmediate(resolve));
});

it('timeout da espera por download não gera unhandledRejection enquanto o reload do popup está pendente (DL-011, critério 1)', async () => {
    const events: string[] = [];
    const popup = fakePopupPageSlowReload(events);
    const page = fakeMainPage(popup);

    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aula.pdf');
    const result = await new DownloadService().downloadFile(page, 'aula.pdf', COURSE, destino, '10', 'jsfcljs();');

    expect(result).toMatchObject({ success: false, error: 'Could not force download from popup' });
    expect(existsSync(fullPath)).toBe(false);
    expect(existsSync(fullPath + '.part')).toBe(false);

    // Deixa o reload, ainda pendente quando o resultado voltou, terminar —
    // sem isso mudar o resultado nem gerar unhandledRejection (vitest reprova
    // o arquivo se houver).
    await new Promise(resolve => setImmediate(resolve));

    const timeoutIndex = events.indexOf('download-timeout-15000');
    const reloadResolveIndex = events.indexOf('reload-resolve');
    expect(timeoutIndex).toBeGreaterThanOrEqual(0);
    expect(reloadResolveIndex).toBeGreaterThan(timeoutIndex);
});
