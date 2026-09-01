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
 *    seja, mais um par para divergir. Ler o `main.ts` é mais barato e usa a
 *    fonte da verdade.
 * 2. **Chamada com `as any`.** Foi assim que `pauseSync` sobreviveu meses: o
 *    cast desliga o verificador (regra 2 do `CLAUDE.md`).
 *
 * Por isso este arquivo lê código como texto. É frágil a mudança de formatação,
 * e o primeiro teste existe para que essa fragilidade apareça como falha em vez
 * de como verde vazio.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const preloadSource = readFileSync(path.join(root, 'electron/preload.ts'), 'utf8');
const mainSource = readFileSync(path.join(root, 'electron/main.ts'), 'utf8');

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
const handledChannels = new Set(
    [...mainSource.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(m => m[1])
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
});
