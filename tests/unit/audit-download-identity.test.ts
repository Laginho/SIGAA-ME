/**
 * DL-004: o lote (`_downloadAllFilesInternal`) pareia retry e fallback por
 * `file.name`, e a deduplicação de disco decide só por caminho resolvido — os
 * dois ignoram `file.id`. Com dois arquivos do mesmo nome (ou nomes que
 * sanitizam igual) no mesmo lote, o retry pega o script errado e o dedup
 * derruba um homônimo que nunca foi baixado.
 *
 * DL-006: a deduplicação em si trocou de mecanismo. Antes decidia por ordem —
 * `claimedPaths` reservava um candidato por posição no array e comparava esse
 * candidato contra `fs.existsSync`, sem saber **quem** baixou o que já está no
 * disco. Agora decide por identidade — só pula um arquivo se `known` (o índice
 * id → caminho que o renderer já mantinha em `localStorage`, agora
 * atravessando o IPC) tem um registro para aquele id, **e** esse registro
 * aponta para um arquivo que ainda existe e é válido (`readHeadSync` +
 * `validateHead`, a mesma decisão de `download.service.ts:70-89`). Sem
 * registro, o arquivo sempre entra na fila — a colisão de nome no disco, se
 * houver, é resolvida no `finalizeDownload` (sufixo numerado, já provado no
 * `DL-004`), não aqui.
 *
 * Seam: `SigaaService.downloadAllFiles`, com `PlaywrightLoginService`,
 * `HttpScraperService` e `fs` mockados — o mesmo seam de
 * `tests/unit/sigaa-service.test.ts`, que já cobre pareamento por id no
 * caminho de arquivo único (`downloadFile`) mas não tinha nenhum teste de
 * lote com mais de um arquivo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    // Sem setup por teste, `existsSync` recusa e `readSync` devolve 0 bytes:
    // nenhum `known` conta como reaproveitável por padrão — só os testes que
    // armam o mock é que provam o caminho de reaproveitamento (critério 1).
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
    openSync: vi.fn(() => 0),
    readSync: vi.fn(() => 0),
    closeSync: vi.fn(),
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
import { parseDownloadAllFilesPayload } from '../../electron/ipc/validation';

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

    it('does not drop a new homonym as a duplicate just because a same-named file is on disk, with no registration (DL-006 critério 2)', async () => {
        // `existsSync` "vê" um arquivo de terceiro em todo candidato — mas
        // sem `known`, nenhum id tem reivindicação sobre ele. O bug antigo
        // (ordem) usava só isto para decidir; agora não basta mais, e os dois
        // tentam baixar. A colisão real de nome no disco é resolvida no
        // `finalizeDownload` (sufixo numerado, já provado no DL-004), não aqui.
        vi.mocked(fs.existsSync).mockReturnValue(true);
        mockHttp.downloadFile
            .mockResolvedValueOnce({ success: true, filePath: '/mock/downloads/Math/same.txt' })
            .mockResolvedValueOnce({ success: true, filePath: '/mock/downloads/Math/same (1).txt' });

        const onProgress = vi.fn();
        const result = await service.downloadAllFiles('C1', 'Math', [FILE_A, FILE_B], '/mock/downloads', onProgress);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.skipped).toBe(0);
        expect(result.data.downloaded).toBe(2);
        expect(mockHttp.downloadFile).toHaveBeenCalledTimes(2);
        expect(onProgress).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'skipped');
    });

    it('skips only the id with a valid registered path; the sibling with no registration downloads instead of the inverse (DL-006 critério 1)', async () => {
        // Hoje (antes do DL-006) o `claimedPaths` reserva por ordem: o
        // primeiro candidato por posição (id 1) leva o skip só por ser
        // primeiro — "hoje é o inverso", como o ticket descreve. `existsSync`
        // sempre verdadeiro isola isso: sem `known`, nada distingue os dois
        // ids, e o mecanismo antigo derruba os DOIS (skip por presença, não
        // por identidade). Só o id com registro válido pode pular.
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readSync).mockImplementation(((_fd: number, buffer: Buffer) => {
            const bytes = Buffer.from('conteudo valido');
            bytes.copy(buffer);
            return bytes.length;
        }) as typeof fs.readSync);
        mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/same.txt' });

        const onProgress = vi.fn();
        const known = [{ fileId: '2', path: '/mock/downloads/Math/same.txt' }];
        const result = await service.downloadAllFiles('C1', 'Math', [FILE_A, FILE_B], '/mock/downloads', onProgress, known);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.skipped).toBe(1);
        expect(result.data.downloaded).toBe(1);
        expect(result.data.results).toEqual(expect.arrayContaining([
            { fileId: '1', fileName: 'same.txt', status: 'downloaded', filePath: '/mock/downloads/Math/same.txt' },
            { fileId: '2', fileName: 'same.txt', status: 'skipped' },
        ]));
        expect(mockHttp.downloadFile).toHaveBeenCalledTimes(1);
        expect(mockHttp.downloadFile).toHaveBeenCalledWith('C1', '1', 'same.txt', expect.any(String), SCRIPT_A);
        expect(onProgress).toHaveBeenCalledWith('2', 'same.txt', 'skipped');
        expect(onProgress).not.toHaveBeenCalledWith('1', 'same.txt', 'skipped');
    });

    it('re-downloads when the registered path exists but fails validateHead — presence alone is not enough (DL-006 critério 3)', async () => {
        const HTML_HEAD = Buffer.from('<!doctype html><html><body>Sessão expirada</body></html>');
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readSync).mockImplementation(((_fd: number, buffer: Buffer) => {
            HTML_HEAD.copy(buffer);
            return HTML_HEAD.length;
        }) as typeof fs.readSync);
        mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/same (2).txt' });

        const onProgress = vi.fn();
        const known = [{ fileId: '2', path: '/mock/downloads/Math/same.txt' }];
        const result = await service.downloadAllFiles('C1', 'Math', [FILE_A, FILE_B], '/mock/downloads', onProgress, known);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.skipped).toBe(0);
        expect(result.data.downloaded).toBe(2);
        expect(mockHttp.downloadFile).toHaveBeenCalledWith('C1', '2', 'same.txt', expect.any(String), SCRIPT_B);
        expect(onProgress).not.toHaveBeenCalledWith('2', 'same.txt', 'skipped');
    });

    it('ignores a registered path outside the chosen download root, even when a file exists everywhere the check might look (DL-006 critério 4)', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readSync).mockImplementation(((_fd: number, buffer: Buffer) => {
            const bytes = Buffer.from('conteudo valido');
            bytes.copy(buffer);
            return bytes.length;
        }) as typeof fs.readSync);
        mockHttp.downloadFile.mockResolvedValue({ success: true, filePath: '/mock/downloads/Math/same.txt' });

        const onProgress = vi.fn();
        // Fora de `/mock/downloads`, a raiz escolhida pelo usuário — o
        // registro não conta, mesmo que o arquivo em si fosse válido.
        const known = [{ fileId: '2', path: '/outro-root/Math/same.txt' }];
        const result = await service.downloadAllFiles('C1', 'Math', [FILE_A, FILE_B], '/mock/downloads', onProgress, known);

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.skipped).toBe(0);
        expect(result.data.downloaded).toBe(2);
        expect(onProgress).not.toHaveBeenCalledWith('2', 'same.txt', 'skipped');
    });
});

describe('parseDownloadAllFilesPayload — known (DL-006 critério 4)', () => {
    const base = { courseId: '540316', courseName: 'Cálculo', files: [{ id: '1', name: 'a.pdf' }] };

    it('aceita payload sem known, para compatibilidade com quem ainda não manda o índice', () => {
        expect(parseDownloadAllFilesPayload(base)).toEqual(base);
    });

    it('aceita known bem formado', () => {
        const known = [{ fileId: '1', path: '/root/Curso/a.pdf' }];
        expect(parseDownloadAllFilesPayload({ ...base, known })).toEqual({ ...base, known });
    });

    it('rejeita known que não é array', () => {
        expect(parseDownloadAllFilesPayload({ ...base, known: 'nope' })).toBeNull();
    });

    it('rejeita item de known sem path', () => {
        expect(parseDownloadAllFilesPayload({ ...base, known: [{ fileId: '1' }] })).toBeNull();
    });

    it('rejeita item de known sem fileId', () => {
        expect(parseDownloadAllFilesPayload({ ...base, known: [{ path: '/root/a.pdf' }] })).toBeNull();
    });
});
