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
        // ⚠️ O apóstrofo no fim NÃO é engano deste teste: `http-scraper` extrai o
        // id de arquivo com `/,id,([^,]+)/` — sem excluir a quote —, então ele
        // captura `555'`. Ver `BUG-009`. Está fixado aqui de propósito: o valor
        // errado vai para o `cache.json` e é o que o diff de sync compara, então
        // corrigir a regex invalida o cache de todo mundo. Quando o `BUG-009`
        // for feito, este assert falha e é aqui que se muda.
        expect(result.files?.map((f: any) => f.id)).toEqual(expect.arrayContaining(["555'", "556'"]));
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
