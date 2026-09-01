/**
 * Parser real contra fixtures em arquivo.
 *
 * Este arquivo substituiu `tests/unit/parser.test.ts`, apagado. Aquele testava
 * uma **cópia** do parser mantida dentro do próprio teste ("mirror the parsing
 * logic in the service", dizia o cabeçalho dele). Cópia não regride junto com o
 * original: o parser real quebrou (`BUG-007`) com 9 testes verdes em cima da
 * cópia. As asserções que valiam a pena foram trazidas para cá.
 *
 * Aqui chamamos `getCourseFiles()` de verdade. O parâmetro `preFetchedHtml`
 * curto-circuita a rede, então é o mesmo caminho de código de produção, sem
 * credencial e sem sair da máquina.
 *
 * As fixtures ainda são sintéticas — ver `tests/fixtures/README.md`. Isto prova
 * que o parser real casa com a estrutura que assumimos; gravar do portal é o
 * passo que prova que a estrutura assumida é a verdadeira.
 */

import * as fs from 'fs';
import { readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { isPackaged: true, getPath: vi.fn(() => '/tmp/sigaa-me-parser-fixtures') }
}));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));
vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        createWriteStream: vi.fn(() => ({ writable: true, write: vi.fn(), on: vi.fn() })),
        promises: { ...actual.promises, writeFile: vi.fn() }
    };
});

import { HttpScraperService } from '../../electron/services/http-scraper.service';

const fixture = (name: string) =>
    readFileSync(path.join(process.cwd(), 'tests/fixtures', name), 'utf8');

let scraper: HttpScraperService;

beforeEach(() => {
    scraper = new HttpScraperService();
    // `getCourseFiles` recusa sem sessão. O cookie é só para passar da guarda —
    // com `preFetchedHtml` nenhuma requisição sai.
    scraper.setCookies([{ name: 'JSESSIONID', value: 'fixture', domain: 'si3.ufc.br' }]);
});

describe('HttpScraperService.getCourseFiles com HTML de fixture', () => {
    it('extrai os arquivos da página de turma, com nome e id', async () => {
        const result = await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));

        expect(result.success).toBe(true);
        expect(result.files?.map((f: any) => f.name)).toEqual(
            expect.arrayContaining(['Lista 3.pdf', 'Exercicios.docx'])
        );
        // Sem a quote do JSF: o onclick termina em `,id,555','` e a extração
        // antiga (`[^,]+`) capturava `555'`. Ver BUG-009.
        expect(result.files?.map((f: any) => f.id)).toEqual(expect.arrayContaining(['555', '556']));
    });

    it('extrai as notícias com id, título e data', async () => {
        const result = await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-news.html'));

        expect(result.success).toBe(true);
        expect(result.news).toHaveLength(2);
        const titles = result.news?.map((n: any) => n.title) ?? [];
        expect(titles).toEqual(expect.arrayContaining(['Prova Remarcada', 'Aula Cancelada']));
        // Ids exatos, não só "truthy": é a asserção que falha se o `BUG-007`
        // (regex com `\\d` dentro de literal) voltar.
        expect(result.news?.map((n: any) => n.id)).toEqual(expect.arrayContaining(['777', '778']));
        expect(result.news?.map((n: any) => n.date)).toEqual(expect.arrayContaining(['10/04/2026']));
    });

    it('trata página sem conteúdo sem estourar', async () => {
        const result = await scraper.getCourseFiles('99999', 'Vazia', fixture('course-page-empty.html'));

        expect(result.success).toBe(true);
        expect(result.files ?? []).toEqual([]);
        expect(result.news ?? []).toEqual([]);
    });

    it('recusa quando não há sessão, em vez de tentar parsear', async () => {
        const semSessao = new HttpScraperService();

        const result = await semSessao.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/login/i);
    });

    it('extrai links Strategy-2 com type link e id determinístico', async () => {
        const result = await scraper.getCourseFiles('88888', 'Física II', fixture('course-page-with-strategy2-link.html'));

        expect(result.success).toBe(true);
        const links = result.files?.filter((f: any) => f.type === 'link') ?? [];
        expect(links).toHaveLength(2);
        expect(links.map((l: any) => l.name)).toEqual(expect.arrayContaining(['Lista 4.pdf', 'Material Extra.zip']));
        expect(links.map((l: any) => l.type)).toEqual(expect.arrayContaining(['link', 'link']));
        expect(links.map((l: any) => l.id)).toEqual(expect.arrayContaining([
            'link:https://si3.ufc.br/sigaa/ava/material/download.jsf?id=12345',
            'link:https://si3.ufc.br/sigaa/ava/material/arquivo.jsf?key=abcde'
        ]));
        expect(links.map((l: any) => l.url)).toEqual(expect.arrayContaining([
            'https://si3.ufc.br/sigaa/ava/material/download.jsf?id=12345',
            'https://si3.ufc.br/sigaa/ava/material/arquivo.jsf?key=abcde'
        ]));
    });

    it('não grava dump de debug em build empacotado (plan 005)', async () => {
        // Regressão: o dump de `preFetchedHtml` era incondicional e usava caminho
        // relativo (`debug_playwright_${courseId}.html`, resolvido contra
        // process.cwd()) — em produção isso escreve fora do userData, sem limpeza
        // possível. Antes da correção este teste chamava fs.promises.writeFile de
        // verdade e deixava debug_playwright_99999.html no repo.
        vi.mocked(fs.promises.writeFile).mockClear();

        const result = await scraper.getCourseFiles('99999', 'Cálculo I', fixture('course-page-with-files.html'));

        expect(result.success).toBe(true);
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });
});
