/**
 * `DL-007` item 9 — o fallback Playwright escolhia a linha do DOM por texto
 * (`text === fname || text.includes(fname) || fname.includes(text)`), e "Aula 1"
 * casava "Aula 10": a linha errada era baixada. `ParsedFile.id` já está no
 * `onclick` JSF de cada linha (`,id,<valor>,` — o mesmo formato que `jsfParam`
 * extrai no parser); o texto só nomeia o arquivo em disco, nunca escolhe o
 * material.
 *
 * `page.evaluate` aqui não roda num browser de verdade: o mock invoca a função
 * passada diretamente contra um `document` global falso, só na primeira
 * chamada (a seleção da linha). Chamadas seguintes (execução do script achado)
 * são registradas mas não executadas — não precisamos rodar JSF de verdade
 * para provar qual linha foi escolhida.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { Page } from 'playwright';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: true, getPath: () => os.tmpdir() } }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }
}));

import { DownloadService } from '../../electron/services/download.service';

const COURSE = 'Cálculo I';
const PDF_MINIMO = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

const SCRIPT_AULA_1 = "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,10','');";
const SCRIPT_AULA_10 = "jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,100','');";

let destino: string;

beforeEach(() => { destino = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-fallback-identity-')); });
afterEach(() => {
    rmSync(destino, { recursive: true, force: true });
    delete (globalThis as { document?: unknown }).document;
});

function stubDom() {
    const row = (onclick: string) => ({
        tagName: 'A',
        getAttribute: (name: string) => (name === 'onclick' ? onclick : undefined),
    });
    (globalThis as { document?: unknown }).document = {
        querySelectorAll: () => [row(SCRIPT_AULA_1), row(SCRIPT_AULA_10)],
    };
}

function fakePage() {
    const download = { suggestedFilename: () => 'aula.pdf', saveAs: vi.fn(async (p: string) => writeFileSync(p, PDF_MINIMO)) };
    const goto = vi.fn(async () => null);
    let evaluateCalls = 0;
    const evaluate = vi.fn((fn: (arg: unknown) => unknown, arg: unknown) => {
        evaluateCalls++;
        return evaluateCalls === 1 ? fn(arg) : undefined;
    });
    const page = {
        url: () => 'https://si3.ufc.br/sigaa/ava/index.jsf',
        route: vi.fn(async () => { }),
        unroute: vi.fn(async () => { }),
        waitForEvent: (name: string) => (name === 'download' ? Promise.resolve(download) : new Promise(() => { })),
        evaluate,
        goto,
    };
    return { page: page as unknown as Page, evaluate, goto };
}

it('pedido pelo id da linha certa executa o onclick dela, mesmo com nome ambíguo no texto ("Aula 1" vs "Aula 10")', async () => {
    stubDom();
    const { page, evaluate } = fakePage();

    const result = await new DownloadService().downloadFile(page, 'Aula 1', COURSE, destino, '10');

    expect(result.success).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(evaluate.mock.calls[1][1]).toBe(SCRIPT_AULA_1);
});

it('sem linha com o id, o resultado é falha, sem goto e sem executar script de outra linha', async () => {
    stubDom();
    const { page, evaluate, goto } = fakePage();

    const result = await new DownloadService().downloadFile(page, 'Aula 3', COURSE, destino, '999');

    expect(result.success).toBe(false);
    expect(goto).not.toHaveBeenCalled();
    expect(evaluate).toHaveBeenCalledTimes(1);
});
