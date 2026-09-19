import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

import { DownloadService } from '../../electron/services/download.service';

let destination: string;
beforeEach(() => { destination = mkdtempSync(path.join(os.tmpdir(), 'sigaa-fallback-early-exit-')); });
afterEach(() => { rmSync(destination, { recursive: true, force: true }); });

function fakePage(scriptThrows: boolean) {
    const rejections: Array<(error: Error) => void> = [];
    const events: string[] = [];
    const evaluate = vi.fn(async () => {
        events.push('evaluate');
        if (scriptThrows && events.filter(event => event === 'evaluate').length === 2) {
            throw new Error('JSF script failed');
        }
        return null;
    });
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async () => {}),
        unroute: vi.fn(async () => {}),
        evaluate,
        waitForEvent: (name: string) => {
            events.push(name);
            return new Promise((_resolve, reject) => { rejections.push(reject); });
        },
    };
    return {
        page: page as unknown as Page, events,
        close: () => rejections.forEach(reject => reject(new Error('Target page, context or browser has been closed'))),
    };
}

it.each([false, true])('saída antecipada não deixa rejeições globais ao fechar o browser (script lança: %s)', async scriptThrows => {
    const { page, events, close } = fakePage(scriptThrows);
    const result = await new DownloadService().downloadFile(
        page, 'aula.pdf', 'Matemática', destination, '10', scriptThrows ? 'jsfcljs();' : undefined,
    );
    expect(result).toMatchObject({
        success: false,
        error: scriptThrows ? 'JSF script failed' : 'Link not found and no script provided in fallback',
    });
    expect(events).toEqual(scriptThrows
        ? ['download', 'popup', 'evaluate', 'evaluate']
        : ['download', 'popup', 'evaluate']);
    close();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
});
