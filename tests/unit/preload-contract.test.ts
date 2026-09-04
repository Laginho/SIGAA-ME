/**
 * Contrato do `window.api`: a metade que o typecheck **não** alcança.
 *
 * A fronteira tem três pontas — declaração para o renderer, ponte no preload,
 * handler no main. Duas delas passaram a ser o mesmo tipo (`RendererApi`, em
 * `shared/ipc.ts`): o preload anota o objeto com ele e o `vite-env.d.ts` declara
 * `window.api` com ele. Ponte faltando virou erro de compilação, então o teste
 * que comparava declaração com ponte saiu daqui — era o `BUG-008`, e agora ele
 * não compila.
 *
 * Sobram duas coisas que nenhum tipo pega:
 *
 * 1. **Canal sem handler.** O nome do canal é uma string passada ao
 *    `ipcRenderer.invoke`; o `tsc` não sabe se existe `ipcMain.handle` do outro
 *    lado. Amarrar isso no tipo exigiria uma terceira lista escrita à mão — ou
 *    seja, mais um par para divergir. Ler o `electron/ipc/register-handlers.ts`
 *    é mais barato e usa a fonte da verdade (SEC-002: os handlers saem do
 *    `main.ts`).
 * 2. **Chamada com `as any`.** Foi assim que `pauseSync` sobreviveu meses: o
 *    cast desliga o verificador (regra 2 do `CLAUDE.md`).
 *
 * Por isso este arquivo lê código como texto. É frágil a mudança de formatação,
 * e o primeiro teste existe para que essa fragilidade apareça como falha em vez
 * de como verde vazio.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const root = process.cwd();
const preloadSource = readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
const mainSource = readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
const sharedSource = readFileSync(path.join(root, 'shared/ipc.ts'), 'utf8');
const domainSource = readFileSync(path.join(root, 'shared/domain.ts'), 'utf8');
const courseDetailSource = readFileSync(path.join(root, 'src/pages/course-detail.ts'), 'utf8');

/** Só o objeto `api` — a ponte genérica `ipcRenderer` é exposta antes e não interessa. */
const apiBlock = preloadSource.slice(preloadSource.indexOf('const api: RendererApi'));

/** Chaves de topo do objeto `api` (indentação de 2 espaços). */
const exposedKeys = new Set(
    [...apiBlock.matchAll(/^ {2}(\w+)\s*:/gm)].map(m => m[1])
);

/** Canais que o preload realmente chama. */
const invokedChannels = new Set(
    [...apiBlock.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m => m[1])
);

/** Canais que o main realmente atende. */
const registerIpcPath = path.join(root, 'electron/ipc/register-handlers.ts');
// Vermelho hoje: o arquivo não existe; a falta de handlers faz o teste de
// "canal que o main não atende" e a sanidade falharem pelo motivo certo.
const registerSource = existsSync(registerIpcPath) ? readFileSync(registerIpcPath, 'utf8') : '';
const handledChannels = new Set(
    [...registerSource.matchAll(/\bhandle\('([^']+)'/g)].map(m => m[1])
);

function collectSourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) return collectSourceFiles(full);
        return full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : [];
    });
}

/** Todo `window.api.X` do renderer, inclusive escondido atrás de `as any`. */
function collectRendererCalls() {
    const calls: { file: string; member: string }[] = [];
    for (const file of collectSourceFiles(path.join(root, 'src'))) {
        const source = readFileSync(file, 'utf8');
        const pattern = /(?:window|\(window as any\))\s*(?:as any\s*)?\)?\s*\.api\.(\w+)/g;
        for (const match of source.matchAll(pattern)) {
            calls.push({ file: path.relative(root, file), member: match[1] });
        }
    }
    return calls;
}

describe('contrato window.api', () => {
    it('expõe pelo menos as pontes que já conhecemos', () => {
        // Sanidade do próprio parser: se a extração falhar, os testes abaixo
        // passariam vazios e não protegeriam nada.
        expect(exposedKeys.size).toBeGreaterThan(10);
        expect(exposedKeys).toContain('getSettings');
        expect(handledChannels).toContain('get-app-settings');
        expect(handledChannels.size).toBeGreaterThanOrEqual(14);
    });

    it('não deixa o renderer chamar nada que o preload não expõe', () => {
        const orphans = collectRendererCalls()
            .filter(call => !exposedKeys.has(call.member))
            .map(call => `${call.file} → window.api.${call.member}`);

        expect(orphans).toEqual([]);
    });

    it('não deixa o preload chamar canal que o main não atende', () => {
        const orphans = [...invokedChannels].filter(channel => !handledChannels.has(channel));

        expect(orphans).toEqual([]);
    });

    it('não acessa membros privados do CacheService por bracket notation no main', () => {
        expect(mainSource).not.toMatch(/cacheService\['/);
    });

    // ── ARCH-001: o que o renderer vê não carrega internos do SIGAA ──────
    it('shared/domain.ts e shared/ipc.ts não declaram script, onclick, href, key, ViewState ou cookie (ARCH-001)', () => {
        // Campo declarado (`nome:` ou `nome?:` no início da linha), não menção em
        // comentário — o comentário explicando a regra pode citar os nomes.
        expect(domainSource).not.toMatch(/^\s+(script|onclick|href|key|viewState|cookies?)\??:/m);
        // `key` fica de fora no ipc.ts: `updateSetting(key, value)` é a chave do
        // setting, não a `key` do JSF.
        expect(sharedSource).not.toMatch(/^\s+(script|onclick|href|viewState|cookies?)\??:/m);
    });

    it('nenhum retorno do RendererApi é Promise<any> ou Promise<unknown> (ARCH-001)', () => {
        const apiInterface = sharedSource.slice(sharedSource.indexOf('export interface RendererApi'));
        expect(apiInterface).not.toMatch(/Promise<any>|Promise<unknown>|unknown\[\]/);
    });

    // ── DL-001: renderer não define raiz de download ──────────────────
    it('shared/ipc.ts não contém basePath nos payloads de download (DL-001)', () => {
        expect(sharedSource).not.toMatch(/basePath/);
    });

    it('course-detail.ts não contém basePath nem updateSetting lastDownloadPath (DL-001)', () => {
        expect(courseDetailSource).not.toMatch(/basePath/);
        expect(courseDetailSource).not.toMatch(/updateSetting\('lastDownloadPath'/);
    });

    // ── SEC-002: a ponte genérica some; o main não fala mais com o renderer ──
    it('nenhum arquivo fora do preload menciona ipcRenderer', () => {
        const offenders = collectSourceFiles(path.join(root, 'src'))
            .filter(file => readFileSync(file, 'utf8').includes('ipcRenderer'))
            .map(file => path.relative(root, file));
        expect(offenders).toEqual([]);
        expect(readFileSync(path.join(root, 'src/vite-env.d.ts'), 'utf8')).not.toContain('ipcRenderer');
        expect(readFileSync(path.join(root, 'electron/electron-env.d.ts'), 'utf8')).not.toContain('ipcRenderer');
    });

    it('preload não expõe a ponte ipcRenderer; main não registra handlers nem manda main-process-message', () => {
        expect(preloadSource).not.toContain("exposeInMainWorld('ipcRenderer'");
        expect(mainSource).not.toMatch(/ipcMain\.handle\(/);
        expect(mainSource).not.toContain('main-process-message');
    });

    it('preload só invoca canais por literal, nunca por variável ou aspas duplas', () => {
        expect(apiBlock).not.toMatch(/invoke\(\s*[^'"]/);
    });

    it('zona de fronteira do ESLint cobre electron/ipc/ (as any vira no-restricted-syntax)', async () => {
        const eslint = new ESLint({ cwd: root });
        const probePath = path.join(root, 'electron/ipc/_probe.ts');
        const [result] = await eslint.lintText('const x = y as any', { filePath: probePath });
        const msgs = result.messages.filter(m => m.ruleId === 'no-restricted-syntax');
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });
});
