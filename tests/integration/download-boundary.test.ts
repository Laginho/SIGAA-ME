/**
 * `DL-002` — fronteira do download: limite de tamanho no caminho HTTP e
 * validação compartilhada no caminho Playwright.
 *
 * Duas coisas são código de produção aqui: `HttpScraperService.downloadFile`
 * (só o `axios` é mockado, como em `download-real.test.ts`) e
 * `DownloadService.downloadFile`, que recebe um `Page` falso com o mínimo que o
 * fluxo de download usa. O `saveAs` do download falso grava bytes de verdade no
 * caminho pedido, então o `.part`, o rename e o unlink são reais.
 *
 * `MAX_DOWNLOAD_BYTES` é substituído por 4096 no arquivo inteiro: um teste não
 * pode transmitir um gigabyte. Isso só funciona se os dois caminhos importarem
 * a constante do módulo — copiar o número para dentro do serviço faz estes
 * testes falharem, de propósito.
 */

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import type { Page } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
    const userData = path.join(os.tmpdir(), 'sigaa-me-download-boundary-userdata');
    mkdirSync(userData, { recursive: true });
    return { app: { isPackaged: true, getPath: () => userData } };
});
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('axios', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));
vi.mock('../../electron/services/file-validation.service', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../electron/services/file-validation.service')>()),
    MAX_DOWNLOAD_BYTES: 4096,
}));

import axios from 'axios';
import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { DownloadService } from '../../electron/services/download.service';

const fixture = (name: string) =>
    readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8');

const DOWNLOAD_SCRIPT =
    "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,555','');";

const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const LOGIN_HTML = '<!DOCTYPE html><html><body>Entrar no Sistema</body></html>';

let destino: string;

beforeEach(() => {
    vi.clearAllMocks();
    destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-boundary-'));
});

afterEach(() => {
    rmSync(destino, { recursive: true, force: true });
});

describe('HttpScraperService.downloadFile — limite de tamanho (DL-002)', () => {
    let scraper: HttpScraperService;

    beforeEach(async () => {
        scraper = new HttpScraperService();
        scraper.setCookies([{ name: 'JSESSIONID', value: 'fixture', domain: 'si3.ufc.br' }]);
        await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));
    });

    it('Content-Length acima do teto é recusado antes de criar o .part, e o stream é destruído', async () => {
        const stream = new Readable({ read() { } });
        vi.mocked(axios.post).mockResolvedValue({
            headers: { 'content-type': 'application/octet-stream', 'content-length': '5000' },
            data: stream
        });

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(false);
        expect(readdirSync(destino)).toEqual([]);
        expect(stream.destroyed).toBe(true);
    });

    it('stream chunked sem Content-Length que passa do teto é abortado e não deixa resíduo', async () => {
        const chunks = Array.from({ length: 6 }, () => Buffer.alloc(1024, 0x41));
        vi.mocked(axios.post).mockResolvedValue({
            headers: { 'content-type': 'application/octet-stream' },
            data: Readable.from(chunks)
        });

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(false);
        expect(readdirSync(destino)).toEqual([]);
    });

    it('arquivo abaixo do teto continua baixando normalmente', async () => {
        const body = Buffer.alloc(4000, 0x41);
        vi.mocked(axios.post).mockResolvedValue({
            headers: { 'content-type': 'application/octet-stream', 'content-length': '4000' },
            data: Readable.from([body])
        });

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(true);
        expect(readdirSync(destino)).toEqual(['LISTA 1']);
        expect(readFileSync(path.join(destino, 'LISTA 1'))).toEqual(body);
    });
});

describe('DownloadService.downloadFile — caminho Playwright usa a mesma validação (DL-002)', () => {
    const COURSE = 'Calculo I';
    const pastaTurma = () => path.join(destino, COURSE);
    const arquivosNaTurma = () => readdirSync(pastaTurma()).sort();

    /**
     * O que `DownloadService.downloadFile` toca num `Page` no ramo "download":
     * `url`, `route`/`unroute`, `waitForEvent('download' | 'popup')` e
     * `evaluate` (procura o link no DOM; devolve `null` para cair no `script`).
     * O download falso grava `body` onde o serviço pedir.
     */
    const fakePage = (body: Buffer | string, suggestedFilename: string) => {
        const saveAs = vi.fn(async (p: string) => { writeFileSync(p, body); });
        const download = { suggestedFilename: () => suggestedFilename, saveAs };
        const page = {
            url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
            route: vi.fn(async () => { }),
            unroute: vi.fn(async () => { }),
            waitForEvent: (name: string) =>
                name === 'download' ? Promise.resolve(download) : new Promise(() => { }),
            evaluate: vi.fn(async () => null),
            isVisible: vi.fn(async () => false),
            click: vi.fn(async () => { }),
            goto: vi.fn(async () => null),
            waitForTimeout: vi.fn(async () => { }),
            waitForLoadState: vi.fn(async () => { }),
            close: vi.fn(async () => { }),
        };
        return { page: page as unknown as Page, saveAs };
    };

    const baixar = (page: Page, fileName = 'LISTA 1') =>
        new DownloadService(null).downloadFile(page, '', fileName, COURSE, destino, DOWNLOAD_SCRIPT);

    it('texto com suggestedFilename .html não vira .pdf e não é apagado', async () => {
        // O redirect JSF faz o Chrome sugerir `.html`; o código antigo trocava
        // por `.pdf` na marra. O nome fica o da UI, e o conteúdo decide.
        const texto = 'primeira linha do arquivo de texto\nsegunda linha\n';
        const { page } = fakePage(texto, 'download.html');

        const result = await baixar(page);

        expect(result.success).toBe(true);
        expect(arquivosNaTurma()).toEqual(['LISTA 1']);
        expect(readFileSync(path.join(pastaTurma(), 'LISTA 1'), 'utf8')).toBe(texto);
    });

    it('texto que menciona o SIGAA sobrevive — não é página de erro', async () => {
        // A detecção antiga era `content.includes('sigaa')` em arquivo < 50 KB:
        // um aviso da disciplina que cite o portal era baixado e deletado.
        const texto = 'Avisos: as notas foram lançadas no SIGAA. Consultem a aba Notas.\n';
        const { page } = fakePage(texto, 'download.html');

        const result = await baixar(page);

        expect(result.success).toBe(true);
        expect(arquivosNaTurma()).toEqual(['LISTA 1']);
    });

    it('PDF com suggestedFilename .html ganha .pdf pelo conteúdo', async () => {
        const { page } = fakePage(PDF_MINIMO, 'download.html');

        const result = await baixar(page);

        expect(result.success).toBe(true);
        expect(arquivosNaTurma()).toEqual(['LISTA 1.pdf']);
    });

    it('página de login é rejeitada e não deixa arquivo nem .part', async () => {
        const { page } = fakePage(LOGIN_HTML, 'download.html');

        const result = await baixar(page);

        expect(result.success).toBe(false);
        expect(arquivosNaTurma()).toEqual([]);
    });

    it('página de sessão expirada propaga JSF_SESSION_EXPIRED, o sinal que dispara a nova tentativa', async () => {
        const { page } = fakePage('<html><body><p>Sessão expirada. Entre novamente.</p></body></html>', 'download.html');

        await expect(baixar(page)).rejects.toThrow('JSF_SESSION_EXPIRED');

        expect(arquivosNaTurma()).toEqual([]);
    });

    it('arquivo já existente no destino que menciona o SIGAA é preservado e reaproveitado', async () => {
        mkdirSync(pastaTurma(), { recursive: true });
        const existente = path.join(pastaTurma(), 'Avisos.txt');
        const conteudo = 'Avisos do SIGAA: prova dia 12.\n';
        writeFileSync(existente, conteudo);
        const { page, saveAs } = fakePage('conteúdo novo que não deve ser gravado', 'Avisos.txt');

        const result = await baixar(page, 'Avisos.txt');

        expect(result).toEqual({ success: true, filePath: existente });
        expect(readFileSync(existente, 'utf8')).toBe(conteudo);
        expect(saveAs).not.toHaveBeenCalled();
        expect(arquivosNaTurma()).toEqual(['Avisos.txt']);
    });

    it('arquivo acima do teto é recusado e o .part removido', async () => {
        const { page } = fakePage(Buffer.alloc(5000, 0x41), 'grande.bin');

        const result = await baixar(page);

        expect(result.success).toBe(false);
        expect(arquivosNaTurma()).toEqual([]);
    });
});
