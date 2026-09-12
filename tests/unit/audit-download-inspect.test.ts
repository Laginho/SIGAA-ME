/**
 * `DL-005` — arquivo em cache que não dá para inspecionar força download novo.
 *
 * Chama `DownloadService.downloadFile` de verdade. O "arquivo" já existente é
 * um diretório no caminho resolvido: `existsSync` diz sim e `readHeadSync`
 * lança `EISDIR`, sem depender de permissão de arquivo (que o Windows ignora
 * para o dono). O `Page` falso está em `about:blank`, então se o serviço seguir
 * para o download ele falha com "Page lost context" — é assim que se prova que
 * ele **não** reaproveitou o caminho ilegível.
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

it('an existing path that cannot be inspected is not reported as a valid download', async () => {
    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aviso.pdf');
    mkdirSync(fullPath, { recursive: true });
    const page = { url: () => 'about:blank' } as unknown as Page;

    const result = await new DownloadService(null).downloadFile(page, '', 'aviso.pdf', COURSE, destino);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Page lost context');
});

it('an existing file with an invalid signature is deleted instead of reused', async () => {
    const { fullPath } = resolveDownloadTarget(destino, COURSE, 'aviso.pdf');
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, 'not a real pdf');
    const page = { url: () => 'about:blank' } as unknown as Page;

    const result = await new DownloadService(null).downloadFile(page, '', 'aviso.pdf', COURSE, destino);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Page lost context');
    expect(existsSync(fullPath)).toBe(false);
});
