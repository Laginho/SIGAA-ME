/**
 * Download real contra respostas de fixture — `BUG-001`.
 *
 * Chama `HttpScraperService.downloadFile()` de verdade. Só o `axios` é mockado;
 * o streaming para disco, a decisão de extensão e a verificação de conteúdo são
 * o código de produção.
 *
 * **Por que este teste escreve em disco de verdade.** O `QA-006` empurrou a
 * suíte para `fs` mockado, mas ali o motivo era um `C:\` hardcoded — ambiente,
 * não comportamento. Aqui o objeto sob teste **é** a gravação em arquivo e o
 * rename: mockar o `fs` mockaria justamente o que se quer provar. O destino é
 * um `mkdtemp` em `os.tmpdir()`, portável, e removido no `afterEach`.
 *
 * **Por que o `courseData` é populado via `getCourseFiles`.** O `downloadFile`
 * depende de um `Map` privado. Enchê-lo com `scraper['courseData']` seria o
 * mesmo acesso por bracket notation que o `BUG-003` existe para remover deste
 * repositório. Chamar `getCourseFiles()` com a fixture é o que a produção faz.
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => {
    // O construtor do serviço abre um WriteStream de log em `userData`, então a
    // pasta precisa existir de verdade antes do primeiro `new`.
    const userData = path.join(os.tmpdir(), 'sigaa-me-download-tests-userdata');
    mkdirSync(userData, { recursive: true });
    return { app: { isPackaged: true, getPath: () => userData } };
});
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('axios', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));

import axios from 'axios';
import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { isInsideRoot } from '../../electron/services/download-path';

const fixture = (name: string) =>
    readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8');

/** O `onclick` que a fixture usa para o arquivo de id 555. */
const DOWNLOAD_SCRIPT =
    "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,555','');";

/** PDF válido mínimo: só os magic bytes importam para a verificação. */
const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

/** Resposta de download: corpo, content-type e headers opcionais. */
const resposta = (body: Buffer | string, contentType: string, extra: Record<string, string> = {}) => ({
    headers: { 'content-type': contentType, 'content-length': String(Buffer.from(body).length), ...extra },
    data: Readable.from([Buffer.from(body)])
});

let scraper: HttpScraperService;
let destino: string;

beforeEach(async () => {
    vi.clearAllMocks();
    destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-download-'));
    scraper = new HttpScraperService();
    scraper.setCookies([{ name: 'JSESSIONID', value: 'fixture', domain: 'si3.ufc.br' }]);
    // Popula o `courseData` (ViewState, action, formName) pelo mesmo caminho da
    // produção. Sem isto o `downloadFile` recusa antes de tentar baixar.
    await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));
});

afterEach(() => {
    rmSync(destino, { recursive: true, force: true });
});

const arquivosNoDestino = () => readdirSync(destino);

describe('HttpScraperService.downloadFile — tipo de conteúdo (BUG-001)', () => {
    it('preserva um .txt servido como octet-stream, sem extensão no nome da UI', async () => {
        const conteudo = 'primeira linha do arquivo de texto\nsegunda linha\n';
        vi.mocked(axios.post).mockResolvedValue(resposta(conteudo, 'application/octet-stream'));

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        // O ponto do BUG-001: o arquivo baixou inteiro e não pode ser apagado.
        // Hoje o fallback inventa `.pdf`, a validação procura `%PDF`, não acha, e
        // dá unlink no arquivo válido.
        expect(arquivosNoDestino()).toHaveLength(1);
        expect(readFileSync(path.join(destino, arquivosNoDestino()[0]), 'utf8')).toBe(conteudo);
        expect(result.success).toBe(true);
    });

    it('nomeia um PDF servido como octet-stream pelo conteúdo, não por chute', async () => {
        // O caso comum num portal de universidade, e a razão de o fallback `.pdf`
        // ter sido escrito. Ele continua sendo atendido — agora porque os bytes
        // dizem `%PDF`, não porque o app supôs.
        vi.mocked(axios.post).mockResolvedValue(resposta(PDF_MINIMO, 'application/octet-stream'));

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(true);
        expect(arquivosNoDestino()).toEqual(['LISTA 1.pdf']);
    });

    it('respeita a extensão que já veio no nome da UI', async () => {
        vi.mocked(axios.post).mockResolvedValue(resposta(PDF_MINIMO, 'application/octet-stream'));

        const result = await scraper.downloadFile('99999', '555', 'Lista 3.pdf', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(true);
        expect(arquivosNoDestino()).toEqual(['Lista 3.pdf']);
    });
});

describe('HttpScraperService — User-Agent emprestado do Playwright (BUG-010)', () => {
    it('o request de download envia o User-Agent configurado por setUserAgent', async () => {
        const uaReal = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
        scraper.setUserAgent(uaReal);
        vi.mocked(axios.post).mockResolvedValue(resposta(PDF_MINIMO, 'application/octet-stream'));

        await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        const calls = vi.mocked(axios.post).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const [, , config] = calls[calls.length - 1];
        expect(config?.headers?.['User-Agent']).toBe(uaReal);
    });

    it('nenhum request do serviço tem User-Agent literal — todos usam this.userAgent', () => {
        // Tripwire de fonte: o teste acima só exercita o request de download; os
        // outros quatro call sites (entrar na disciplina, dashboard, abrir
        // arquivos, notícias) não têm teste de comportamento. Um literal
        // reintroduzido em qualquer um deles volta a apresentar ao SIGAA uma
        // identidade diferente da sessão que o Playwright criou.
        const src = readFileSync(
            path.join(process.cwd(), 'electron/services/http-scraper.service.ts'),
            'utf8'
        );
        expect(src.match(/'User-Agent':\s*'/)).toBeNull();
    });
});

describe('HttpScraperService.downloadFile — falhas não deixam resíduo (BUG-001)', () => {
    it('rejeita HTML disfarçado de PDF e não deixa nada no destino', async () => {
        // O SIGAA responde a sessão expirada com a página de login, status 200.
        // Aqui o `Content-Disposition` afirma `.pdf`, então a extensão NÃO vem do
        // conteúdo — é o caminho em que a verificação por magic bytes precisa
        // continuar mordendo.
        vi.mocked(axios.post).mockResolvedValue(
            resposta('<!DOCTYPE html><html><body>Entrar no Sistema</body></html>', 'application/octet-stream', {
                'content-disposition': 'attachment; filename="LISTA 1.pdf"'
            })
        );

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(false);
        // Nem o arquivo final, nem o `.part`.
        expect(arquivosNoDestino()).toEqual([]);
    });

    it('rejeita HTML servido sem Content-Disposition, quando a extensão sairia do conteúdo', async () => {
        vi.mocked(axios.post).mockResolvedValue(
            resposta('<html><body>Sessão expirada</body></html>', 'application/octet-stream')
        );

        const result = await scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(false);
        expect(arquivosNoDestino()).toEqual([]);
    });

    it('conexão interrompida no meio do stream não deixa arquivo nem trava a Promise', async () => {
        // `pipe()` não propaga erro do source para o destino: sem o handler de
        // erro no `response.data`, esta Promise nunca resolveria e a UI ficaria
        // em "baixando" para sempre.
        const stream = new Readable({ read() { } });
        vi.mocked(axios.post).mockResolvedValue({
            headers: { 'content-type': 'application/octet-stream', 'content-length': '999' },
            data: stream
        });

        const pendente = scraper.downloadFile('99999', '555', 'LISTA 1', destino, DOWNLOAD_SCRIPT);
        stream.push(Buffer.from('metade do arqu'));
        stream.destroy(new Error('socket hang up'));

        const result = await pendente;

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/socket hang up/);
        expect(arquivosNoDestino()).toEqual([]);
    });
});

describe('DL-001 — contenção no gravador HTTP', () => {
    it('traversal no nome do arquivo é sanitizado e o resultado fica dentro de destino', async () => {
        const parentBefore = readdirSync(path.dirname(destino));
        vi.mocked(axios.post).mockResolvedValue(resposta(PDF_MINIMO, 'application/octet-stream'));

        const result = await scraper.downloadFile('99999', '555', '../../evil.pdf', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(true);
        // filePath must be inside destino — same proof the writer uses
        expect(isInsideRoot(destino, result.filePath!)).toBe(true);
        // exactly one file in destino, name has no separators
        const files = arquivosNoDestino();
        expect(files).toHaveLength(1);
        expect(files[0]).not.toMatch(/[/\\]/);
        // nothing created outside destino
        const parentAfter = readdirSync(path.dirname(destino));
        expect(parentAfter).toEqual(parentBefore);
    });

    it('fileName ".." é rejeitado e destino fica vazio', async () => {
        vi.mocked(axios.post).mockResolvedValue(resposta(PDF_MINIMO, 'application/octet-stream'));

        const result = await scraper.downloadFile('99999', '555', '..', destino, DOWNLOAD_SCRIPT);

        expect(result.success).toBe(false);
        expect(arquivosNoDestino()).toEqual([]);
    });
});
