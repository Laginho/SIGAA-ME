/**
 * `DL-007` critério 5 — o fallback Playwright não reaproveita mais arquivo por
 * caminho: quem chega aqui já passou pela dedup por id do lote (`known`,
 * `isReusableDownload`), então sempre baixa e finaliza por `finalizeDownload`.
 * Um arquivo (ou pasta) já existente no caminho de destino, legível ou não,
 * nunca mais intercepta o download nem é apagado por este método — a decisão
 * de pular um arquivo já baixado é só do chamador (`SigaaService`), antes de
 * chegar aqui.
 *
 * Chama `DownloadService.downloadFile` de verdade. O `Page` falso está em
 * `about:blank`, então o download sempre falha com "Page lost context" — é
 * assim que se prova que o arquivo pré-existente não foi nem lido nem tocado.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));

import { DownloadService } from '../../electron/services/download.service';
import { resolveDownloadTarget } from '../../electron/services/download-path';

const COURSE = 'Cálculo I';
let destino: string;

beforeEach(() => { destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-inspect-')); });
afterEach(() => { rmSync(destino, { recursive: true, force: true }); });

it('pasta já existente no caminho de destino não intercepta o download', async () => {
    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aviso.pdf');
    mkdirSync(fullPath, { recursive: true });
    const page = { url: () => 'about:blank' } as unknown as Page;

    const result = await new DownloadService().downloadFile(page, '', 'aviso.pdf', COURSE, destino, '10');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Page lost context');
});

it('arquivo inválido já existente no caminho de destino não intercepta o download nem é apagado', async () => {
    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aviso.pdf');
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, 'not a real pdf');
    const page = { url: () => 'about:blank' } as unknown as Page;

    const result = await new DownloadService().downloadFile(page, '', 'aviso.pdf', COURSE, destino, '10');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Page lost context');
    expect(existsSync(fullPath)).toBe(true);
});
