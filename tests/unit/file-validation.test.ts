/**
 * `DL-002` — validação de arquivo compartilhada entre o download HTTP e o
 * Playwright. Chama `electron/services/file-validation.service.ts` de verdade.
 *
 * `finalizeDownload` escreve em disco de propósito: o objeto sob teste é o
 * rename/unlink do `.part`. Destino é um `mkdtemp`, removido no `afterEach`.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    fileNameFromContentDisposition,
    finalizeDownload,
    resolveFileName,
    validateHead,
} from '../../electron/services/file-validation.service';

const hex = (h: string) => Buffer.from(h, 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const PK = Buffer.concat([hex('504B0304'), Buffer.alloc(28)]);
const OLE = Buffer.concat([hex('D0CF11E0A1B11AE1'), Buffer.alloc(24)]);
const SEVEN_Z = Buffer.concat([hex('377ABCAF271C'), Buffer.alloc(26)]);
const GZ = Buffer.concat([hex('1F8B08'), Buffer.alloc(29)]);
const PNG = Buffer.concat([hex('89504E470D0A1A0A'), Buffer.alloc(24)]);
const TEXTO = Buffer.from('primeira linha do arquivo de texto\nsegunda linha\n');
const BINARIO = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x7f, 0x10, 0x20, 0x30]);
const LOGIN_HTML = Buffer.from('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0"><html><body>Entrar no Sistema</body></html>');

describe('fileNameFromContentDisposition', () => {
    it('lê filename simples, entre aspas e filename* percent-decoded', () => {
        expect(fileNameFromContentDisposition('attachment; filename=lista.pdf')).toBe('lista.pdf');
        expect(fileNameFromContentDisposition('attachment; filename="LISTA 1.pdf"')).toBe('LISTA 1.pdf');
        expect(fileNameFromContentDisposition("attachment; filename*=UTF-8''lista%20final.pdf")).toBe('lista final.pdf');
    });

    it('sem header ou sem filename devolve undefined', () => {
        expect(fileNameFromContentDisposition(undefined)).toBeUndefined();
        expect(fileNameFromContentDisposition('inline')).toBeUndefined();
    });
});

describe('resolveFileName — ordem: extensão existente → dica → MIME → assinatura', () => {
    it('extensão existente no nome da UI vence a dica do servidor', () => {
        // docx é PK; o servidor diz zip. O nome que o aluno vê fica como está.
        expect(resolveFileName({ fileName: 'Aula 1.docx', hintFileName: 'x.zip', head: PK })).toBe('Aula 1.docx');
    });

    it('"Aula 1.5" não tem extensão: ".5" não é uma, e o PDF ganha .pdf', () => {
        expect(resolveFileName({ fileName: 'Aula 1.5', head: PDF })).toBe('Aula 1.5.pdf');
    });

    it('".7z" e ".py" contam como extensão existente', () => {
        expect(resolveFileName({ fileName: 'pacote.7z', head: SEVEN_Z })).toBe('pacote.7z');
        expect(resolveFileName({ fileName: 'script.py', contentType: 'text/plain', head: TEXTO })).toBe('script.py');
    });

    it('extensão da dica do servidor é acrescentada em minúsculas quando o nome não tem', () => {
        expect(resolveFileName({ fileName: 'LISTA 1', hintFileName: 'lista.PDF', head: PDF })).toBe('LISTA 1.pdf');
    });

    it('dica com caracteres fora de [a-z0-9] é ignorada e o conteúdo decide', () => {
        expect(resolveFileName({ fileName: 'LISTA 1', hintFileName: 'x.p*f', head: PDF })).toBe('LISTA 1.pdf');
    });

    it('.html/.htm vindo da dica ou do MIME é artefato do redirect JSF: o conteúdo decide', () => {
        expect(resolveFileName({ fileName: 'LISTA 1', hintFileName: 'download.html', head: PDF })).toBe('LISTA 1.pdf');
        expect(resolveFileName({ fileName: 'LISTA 1', hintFileName: 'download.htm', head: TEXTO })).toBe('LISTA 1');
        expect(resolveFileName({ fileName: 'LISTA 1', contentType: 'text/html; charset=UTF-8', head: PDF })).toBe('LISTA 1.pdf');
    });

    it('MIME conhecido dá a extensão; octet-stream não dá nada', () => {
        expect(resolveFileName({ fileName: 'LISTA 1', contentType: 'application/pdf', head: PDF })).toBe('LISTA 1.pdf');
        expect(resolveFileName({ fileName: 'notas', contentType: 'text/plain; charset=ISO-8859-1', head: TEXTO })).toBe('notas.txt');
        expect(resolveFileName({ fileName: 'notas', contentType: 'application/octet-stream', head: TEXTO })).toBe('notas');
    });

    it('sem dica nem MIME, a assinatura nomeia: pdf, png, 7z, gz; PK vira .zip', () => {
        expect(resolveFileName({ fileName: 'a', head: PDF })).toBe('a.pdf');
        expect(resolveFileName({ fileName: 'a', head: PNG })).toBe('a.png');
        expect(resolveFileName({ fileName: 'a', head: SEVEN_Z })).toBe('a.7z');
        expect(resolveFileName({ fileName: 'a', head: GZ })).toBe('a.gz');
        expect(resolveFileName({ fileName: 'a', head: PK })).toBe('a.zip');
    });

    it('OLE (doc/xls/ppt) e texto sem dica ficam sem extensão — nunca .bin, nunca chute', () => {
        expect(resolveFileName({ fileName: 'Apostila', head: OLE })).toBe('Apostila');
        expect(resolveFileName({ fileName: 'LISTA 1', head: TEXTO })).toBe('LISTA 1');
    });
});

describe('validateHead — assinaturas', () => {
    it('extensão conhecida com bytes incompatíveis é rejeitada', () => {
        expect(validateHead(PK, '.pdf')).toEqual({ ok: false, reason: 'signature-mismatch' });
        expect(validateHead(PDF, '.docx')).toEqual({ ok: false, reason: 'signature-mismatch' });
        expect(validateHead(PDF, '.xls')).toEqual({ ok: false, reason: 'signature-mismatch' });
        expect(validateHead(TEXTO, '.png')).toEqual({ ok: false, reason: 'signature-mismatch' });
    });

    it('Office, OpenDocument, 7z e gz são reconhecidos', () => {
        expect(validateHead(OLE, '.doc')).toEqual({ ok: true });
        expect(validateHead(OLE, '.xls')).toEqual({ ok: true });
        expect(validateHead(OLE, '.ppt')).toEqual({ ok: true });
        expect(validateHead(PK, '.docx')).toEqual({ ok: true });
        expect(validateHead(PK, '.odt')).toEqual({ ok: true });
        expect(validateHead(PK, '.ods')).toEqual({ ok: true });
        expect(validateHead(SEVEN_Z, '.7z')).toEqual({ ok: true });
        expect(validateHead(GZ, '.gz')).toEqual({ ok: true });
    });

    it('extensão sem assinatura registrada passa com qualquer conteúdo (BUG-001)', () => {
        expect(validateHead(BINARIO, '.csv')).toEqual({ ok: true });
        expect(validateHead(BINARIO, '.m')).toEqual({ ok: true });
        expect(validateHead(BINARIO, '')).toEqual({ ok: true });
        expect(validateHead(TEXTO, '.txt')).toEqual({ ok: true });
    });

    it('arquivo menor que a assinatura não é rejeitado por isso', () => {
        expect(validateHead(Buffer.from('ok'), '.txt')).toEqual({ ok: true });
    });
});

describe('validateHead — HTML é sempre rejeitado', () => {
    const htmls: Array<[string, Buffer]> = [
        ['<!DOCTYPE', LOGIN_HTML],
        ['<html', Buffer.from('<html><body>Sessão expirada</body></html>')],
        ['maiúsculas', Buffer.from('<HTML><BODY>x</BODY></HTML>')],
        ['dez quebras de linha antes', Buffer.from('\n'.repeat(10) + '<html><body>x</body></html>')],
        ['BOM antes', Buffer.concat([hex('EFBBBF'), Buffer.from('<!doctype html><html></html>')])],
        ['prólogo xml antes', Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"><html></html>')],
    ];

    it.each(htmls)('%s', (_nome, head) => {
        for (const ext of ['', '.pdf', '.txt', '.html']) {
            expect(validateHead(head, ext)).toEqual({ ok: false, reason: 'html' });
        }
    });

    it('XML que não é HTML passa', () => {
        expect(validateHead(Buffer.from('<?xml version="1.0"?><notas><nota>9.5</nota></notas>'), '.xml')).toEqual({ ok: true });
    });

    it('texto que só menciona HTML ou SIGAA no meio não é HTML', () => {
        expect(validateHead(Buffer.from('Avisos do SIGAA: a prova de <html> foi adiada.'), '.txt')).toEqual({ ok: true });
    });
});

describe('finalizeDownload', () => {
    let dir: string;
    const part = () => path.join(dir, 'LISTA 1.part');
    const arquivos = () => readdirSync(dir).sort();

    beforeEach(() => {
        dir = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-finalize-'));
    });
    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it('conteúdo válido: resolve o nome, renomeia e não deixa .part', async () => {
        writeFileSync(part(), PDF);

        const r = await finalizeDownload({ partPath: part(), dir, fileName: 'LISTA 1', contentType: 'application/octet-stream' });

        expect(r).toEqual({ ok: true, filePath: path.join(dir, 'LISTA 1.pdf') });
        expect(arquivos()).toEqual(['LISTA 1.pdf']);
    });

    it('texto sem extensão sobrevive com o nome da UI (BUG-001)', async () => {
        writeFileSync(part(), TEXTO);

        const r = await finalizeDownload({ partPath: part(), dir, fileName: 'LISTA 1' });

        expect(r.ok).toBe(true);
        expect(arquivos()).toEqual(['LISTA 1']);
        expect(readFileSync(path.join(dir, 'LISTA 1'))).toEqual(TEXTO);
    });

    it('HTML: remove o .part e devolve html', async () => {
        writeFileSync(part(), LOGIN_HTML);

        const r = await finalizeDownload({ partPath: part(), dir, fileName: 'LISTA 1', hintFileName: 'LISTA 1.pdf' });

        expect(r).toMatchObject({ ok: false, reason: 'html' });
        expect(arquivos()).toEqual([]);
    });

    it('HTML de sessão expirada, com o marcador além dos primeiros 512 bytes, devolve session-expired', async () => {
        const pagina = '<html><head><title>SIGAA</title></head><body>' + '<div class="x"></div>'.repeat(120) + '<p>Sessão expirada. Entre novamente.</p></body></html>';
        expect(pagina.indexOf('expirada')).toBeGreaterThan(2000);
        writeFileSync(part(), pagina);

        const r = await finalizeDownload({ partPath: part(), dir, fileName: 'LISTA 1' });

        expect(r).toMatchObject({ ok: false, reason: 'session-expired' });
        expect(arquivos()).toEqual([]);
    });

    it('assinatura incompatível com a extensão da UI: remove o .part', async () => {
        writeFileSync(path.join(dir, 'Lista 3.pdf.part'), PK);

        const r = await finalizeDownload({ partPath: path.join(dir, 'Lista 3.pdf.part'), dir, fileName: 'Lista 3.pdf' });

        expect(r).toMatchObject({ ok: false, reason: 'signature-mismatch' });
        expect(arquivos()).toEqual([]);
    });

    it('nome inválido: remove o .part e propaga o erro', async () => {
        writeFileSync(part(), PDF);

        await expect(finalizeDownload({ partPath: part(), dir, fileName: '..' })).rejects.toThrow();

        expect(existsSync(part())).toBe(false);
        expect(arquivos()).toEqual([]);
    });
});
