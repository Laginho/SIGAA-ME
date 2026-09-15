/**
 * SEC-004 — o ramo `href` do fallback de download (`downloadFile`, script
 * fresco do DOM) não pode navegar para qualquer URL que o `evaluate` ache na
 * página. Um material `type: 'link'` postado pelo professor aponta para fora
 * do SIGAA (ex.: Google Drive), e hoje o `page.goto` roda nele sem checagem —
 * é o mesmo `href` que o filtro de `sigaa.service.ts` (critério 2) tenta
 * nunca deixar chegar até aqui, mas o fallback precisa da própria trava.
 *
 * Mesma montagem de página falsa de `tests/integration/download-boundary.test.ts`
 * (`DownloadService.downloadFile` real, só o `Page` é falso).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));

import { DownloadService } from '../../electron/services/download.service';

const COURSE = 'Cálculo I';
let destino: string;

beforeEach(() => { destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-external-url-')); });
afterEach(() => { rmSync(destino, { recursive: true, force: true }); });

const fakePage = (hrefValue: string) => {
    const saveAs = vi.fn(async (p: string) => { writeFileSync(p, 'conteudo'); });
    const download = { suggestedFilename: () => 'download.txt', saveAs };
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async () => { }),
        unroute: vi.fn(async () => { }),
        waitForEvent: (name: string) =>
            name === 'download' ? Promise.resolve(download) : new Promise(() => { }),
        evaluate: vi.fn(async () => ({ type: 'href', value: hrefValue })),
        goto: vi.fn(async () => null),
    };
    return { page: page as unknown as Page, saveAs };
};

it('refuses to navigate to a fresh href that points outside si3.ufc.br', async () => {
    const { page, saveAs } = fakePage('https://drive.google.com/x');

    const result = await new DownloadService(null).downloadFile(page, '', 'aviso.pdf', COURSE, destino);

    expect(page.goto).not.toHaveBeenCalled();
    expect(saveAs).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
});

it('navigates when the fresh href resolves to si3.ufc.br itself', async () => {
    const { page } = fakePage('https://si3.ufc.br/sigaa/verArquivo?idArquivo=123');

    const result = await new DownloadService(null).downloadFile(page, '', 'aviso.pdf', COURSE, destino);

    expect(page.goto).toHaveBeenCalled();
    expect(result.success).toBe(true);
});
