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
 * uma subpasta de um `mkdtemp` em `os.tmpdir()`, portável, e removido no
 * `afterEach`.
 *
 * **Por que o `courseData` é populado via `getCourseFiles`.** O `downloadFile`
 * depende de um `Map` privado. Enchê-lo com `scraper['courseData']` seria o
 * mesmo acesso por bracket notation que o `BUG-003` existe para remover deste
 * repositório. Chamar `getCourseFiles()` com a fixture é o que a produção faz.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `vi.spyOn(fs, 'createWriteStream')` não funciona em ESM (namespace não é
 * reconfigurável); mockar o módulo inteiro e encaminhar para o real por
 * padrão dá o mesmo controle sem esse limite (mesmo padrão de
 * `tests/unit/portal-compatibility.test.ts`).
 */
const fsMock = vi.hoisted(() => ({
    createWriteStream: vi.fn(),
    real: null as any,
}));
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    fsMock.real = actual.createWriteStream;
    fsMock.createWriteStream.mockImplementation(actual.createWriteStream);
    return { ...actual, createWriteStream: fsMock.createWriteStream };
});

vi.mock('electron', () => {
    // O construtor do serviço abre um WriteStream de log em `userData`, então a
    // pasta precisa existir de verdade antes do primeiro `new`. Nome sorteado e
    // não fixo: dois arquivos de teste em workers paralelos, ou duas sessões
    // rodando o gate ao mesmo tempo, dividiriam o mesmo diretório.
    const userData = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-download-tests-'));
    return { app: { isPackaged: true, getPath: () => userData } };
});
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));
vi.mock('axios', () => ({
    default: { get: vi.fn(), post: vi.fn() }
}));

import axios from 'axios';
import { HttpScraperService } from '../../electron/services/http-scraper.service';

const fixture = (name: string) =>
    readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8');

/** O `onclick` que a fixture usa para o arquivo de id 555. */
const DOWNLOAD_SCRIPT =
    "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,555','');";

/** Resposta de download: corpo, content-type e headers opcionais. */
const resposta = (body: Buffer | string, contentType: string, extra: Record<string, string> = {}) => ({
    headers: { 'content-type': contentType, 'content-length': String(Buffer.from(body).length), ...extra },
    data: Readable.from([Buffer.from(body)])
});

let scraper: HttpScraperService;
/** Pai do `destino`, privado deste teste. As asserções de contenção comparam o
 *  conteúdo do pai; se fosse o `os.tmpdir()`, um `mkdtemp` de outro worker do
 *  vitest entraria na lista e o teste falharia por engano. */
let sandbox: string;
let destino: string;

beforeEach(async () => {
    vi.clearAllMocks();
    sandbox = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-download-'));
    destino = path.join(sandbox, 'destino');
    mkdirSync(destino);
    scraper = new HttpScraperService();
    scraper.setCookies([{ name: 'JSESSIONID', value: 'fixture', domain: 'si3.ufc.br' }]);
    // Popula o `courseData` (ViewState, action, formName) pelo mesmo caminho da
    // produção. Sem isto o `downloadFile` recusa antes de tentar baixar.
    await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));
});

afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
    // O writer-error test troca a implementação de `createWriteStream`; sem
    // isto, os testes seguintes herdariam um `writer` que se autodestrói.
    fsMock.createWriteStream.mockImplementation(fsMock.real);
});

describe('audit download disk failures and collisions', () => {
    it('resolves a writer error with a readable per-file failure', async () => {
        vi.mocked(axios.post).mockResolvedValue(resposta('contents', 'text/plain'));
        rmSync(destino, { recursive: true });
        await expect(scraper.downloadFile('99999', '555', 'file.txt', destino, DOWNLOAD_SCRIPT))
            .resolves.toMatchObject({ success: false, error: expect.stringContaining('ENOENT') });
    });

    // DL-003 carry-over: o teste acima apaga `destino` inteiro antes de
    // baixar, então o `createWriteStream` nunca chega a abrir o `.part` — o
    // `unlink` de `descartarParcial` erra em silêncio contra um arquivo que
    // nunca existiu. Aqui o `.part` chega a existir de verdade no disco e só
    // depois o `writer` emite `error`; a prova é que ele some depois.
    it('discards a `.part` that reached disk when the writer errors mid-write', async () => {
        vi.mocked(axios.post).mockResolvedValue(resposta('contents', 'text/plain'));
        const partPath = path.join(destino, 'file.txt.part');
        let partExistedAtErrorTime = false;

        fsMock.createWriteStream.mockImplementation((...args: unknown[]) => {
            const stream = fsMock.real(...args);
            stream.once('open', () => {
                partExistedAtErrorTime = existsSync(partPath);
                stream.destroy(Object.assign(new Error('erro de escrita simulado'), { code: 'EACCES' }));
            });
            return stream;
        });

        const result = await scraper.downloadFile('99999', '555', 'file.txt', destino, DOWNLOAD_SCRIPT);

        expect(result).toMatchObject({ success: false, error: expect.stringContaining('erro de escrita simulado') });
        expect(partExistedAtErrorTime).toBe(true);
        expect(existsSync(partPath)).toBe(false);
    });

    // DL-004: dois arquivos de ids diferentes cujo nome colide (exato, ou
    // sanitiza/trunca igual) não podem terminar como um arquivo só no disco —
    // o segundo `rename` sobrescrevia o primeiro em silêncio.
    it.each([
        ['nomes idênticos', 'same.txt', 'same.txt'],
        ['nomes que sanitizam para o mesmo segmento', 'Lista:1.txt', 'Lista/1.txt'],
        ['nomes que truncam para o mesmo segmento de 150', 'a'.repeat(200) + '.txt', 'a'.repeat(200) + '_variante.txt'],
    ])('preserva os dois downloads com nomes colidentes (%s)', async (_label, nameA, nameB) => {
        vi.mocked(axios.post)
            .mockResolvedValueOnce(resposta('conteudo-A', 'text/plain'))
            .mockResolvedValueOnce(resposta('conteudo-B', 'text/plain'));

        const resultA = await scraper.downloadFile('99999', '555', nameA, destino, DOWNLOAD_SCRIPT);
        const resultB = await scraper.downloadFile('99999', '556', nameB, destino, DOWNLOAD_SCRIPT);

        expect(resultA).toMatchObject({ success: true });
        expect(resultB).toMatchObject({ success: true });
        if (!resultA.success || !resultB.success) throw new Error('esperava sucesso nos dois downloads');
        expect(resultA.filePath).not.toBe(resultB.filePath);

        expect(readFileSync(resultA.filePath, 'utf8')).toBe('conteudo-A');
        expect(readFileSync(resultB.filePath, 'utf8')).toBe('conteudo-B');
    });
});
