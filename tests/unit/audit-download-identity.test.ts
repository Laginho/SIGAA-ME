/**
 * DL-004: o lote (`_downloadAllFilesInternal`) pareia retry e fallback por
 * `file.name`, e a deduplicação de disco decide só por caminho resolvido — os
 * dois ignoram `file.id`. Com dois arquivos do mesmo nome (ou nomes que
 * sanitizam igual) no mesmo lote, o retry pega o script errado e o dedup
 * derruba um homônimo que nunca foi baixado.
 *
 * Seam: `SigaaService.downloadAllFiles`, com `PlaywrightLoginService`,
 * `HttpScraperService` e `fs` mockados — o mesmo seam de
 * `tests/unit/sigaa-service.test.ts`, que já cobre pareamento por id no
 * caminho de arquivo único (`downloadFile`) mas não tinha nenhum teste de
 * lote com mais de um arquivo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
}));

vi.mock('../../electron/services/playwright-login.service', () => {
    return {
        PlaywrightLoginService: class {
            login = vi.fn();
            close = vi.fn();
            logout = vi.fn();
            getCourses = vi.fn();
            enterCourseAndGetHTML = vi.fn();
            navigateToFilesSection = vi.fn();
            loadAllNews = vi.fn();
            downloadFile = vi.fn();
            getNewsDetail = vi.fn();
            getUserAgent = vi.fn().mockResolvedValue('mock-ua');
            getCookies = vi.fn().mockReturnValue([]);
        }
    };
});

vi.mock('../../electron/services/http-scraper.service', () => {
    return {
        HttpScraperService: class {
            setCookies = vi.fn();
            setUserAgent = vi.fn();
            resetSession = vi.fn();
            getCourseFiles = vi.fn();
            downloadFile = vi.fn();
        }
    };
});

vi.mock('../../electron/services/logger.service', () => {
    const scoped = () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() });
    return {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), scope: vi.fn(scoped) }
    };
});

vi.mock('electron', () => ({
    app: { getPath: vi.fn().mockReturnValue('/mock/downloads'), isPackaged: false }
}));

import * as fs from 'fs';
import { SigaaService } from '../../electron/services/sigaa.service';

const SCRIPT_A = "jsfcljs(document.getElementById('formAva'),'formAva:download,formAva:download,id,1','');";
const SCRIPT_B = "jsfcljs(document.getElementById('formAva'),'formAva:download,formAva:download,id,2','');";
const FILE_A = { id: '1', name: 'same.txt' };
const FILE_B = { id: '2', name: 'same.txt' };
const PARSED_A = { id: '1', name: 'same.txt', type: 'file', script: SCRIPT_A };
const PARSED_B = { id: '2', name: 'same.txt', type: 'file', script: SCRIPT_B };

describe('SigaaService.downloadAllFiles — identidade por id (DL-004)', () => {
    let service: SigaaService;
    let mockPlaywright: any;
    let mockHttp: any;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new SigaaService();
        mockPlaywright = (service as any).playwrightLogin;
        mockHttp = (service as any).httpScraper;
        mockPlaywright.enterCourseAndGetHTML.mockResolvedValue({ success: true, html: '<html></html>' });
        mockHttp.getCourseFiles.mockResolvedValue({ success: true, files: [PARSED_A, PARSED_B] });
    });

    it('retries the failed file by id, not by its (colliding) name, and keeps both downloads (critério 1)', async () => {
        mockHttp.downloadFile
            .mockResolvedValueOnce({ success: true, filePath: '/mock/downloads/Math/same.txt' })       // A, primeira tentativa
            .mockResolvedValueOnce({ success: false, error: 'HTTP Error 302' })                          // B, primeira tentativa
            .mockResolvedValueOnce({ success: true, filePath: '/mock/downloads/Math/same (1).txt' });    // B, retry

        const onProgress = vi.fn();
        const result = await service.downloadAllFiles('C1', 'Math', [FILE_A, FILE_B], '/mock/downloads', onProgress);

        expect(mockHttp.downloadFile).toHaveBeenCalledTimes(3);
        // A retentativa tem que ser pelo id de B, não pelo de A — o nome dos dois é igual.
        expect(mockHttp.downloadFile.mock.calls[2][1]).toBe('2');
        expect(mockHttp.downloadFile.mock.calls[2][4]).toBe(SCRIPT_B);

        expect(result).toEqual({
            success: true,
            data: {
                downloaded: 2, skipped: 0, failed: 0,
                results: expect.arrayContaining([
                    { fileId: '1', fileName: 'same.txt', status: 'downloaded', filePath: '/mock/downloads/Math/same.txt' },
                    { fileId: '2', fileName: 'same.txt', status: 'downloaded', filePath: '/mock/downloads/Math/same (1).txt' },
                ])
            }
        });
        expect(onProgress).toHaveBeenCalledWith('2', 'same.txt', 'downloaded');
    });

    it('does not drop a new homonym as a duplicate of a different id already on disk (critérios 2 e 5)', async () => {
        // Só o caminho sem sufixo já existe — simula que outro id ocupou "same.txt"
        // antes; "same.txt" é o primeiro candidato do lote (FILE_A), o segundo
        // (FILE_B) recebe o próximo candidato livre e não pode ser marcado skipped
        // só porque o nome cru colide.
        vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('same.txt'));
        mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/same (1).txt' });

        const onProgress = vi.fn();
        const result = await service.downloadAllFiles('C1', 'Math', [FILE_A, FILE_B], '/mock/downloads', onProgress);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.skipped).toBe(1);
        expect(result.data.downloaded).toBe(1);
        expect(result.data.results).toEqual(expect.arrayContaining([
            { fileId: '1', fileName: 'same.txt', status: 'skipped' },
            { fileId: '2', fileName: 'same.txt', status: 'downloaded', filePath: '/mock/downloads/Math/same (1).txt' },
        ]));
        // Só o id descartado como duplicata é reportado como skipped ao renderer.
        expect(onProgress).toHaveBeenCalledWith('1', 'same.txt', 'skipped');
        expect(onProgress).not.toHaveBeenCalledWith('2', 'same.txt', 'skipped');
        // A entrada nova de fato tentou baixar — não foi só descartada em silêncio.
        expect(mockHttp.downloadFile).toHaveBeenCalledWith('C1', '2', 'same.txt', expect.any(String), SCRIPT_B);
    });
});
