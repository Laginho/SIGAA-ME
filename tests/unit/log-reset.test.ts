/**
 * DATA-002, achados da revisão — os dois logs que o `clear-all-data` zera.
 *
 * `HttpScraperService.resetLog()` não aguardava o `end()` do stream antigo. O
 * handle novo truncava, e o antigo terminava de descarregar o buffer depois
 * disso, **no offset antigo**: `scraper.log` voltava ao tamanho de antes com o
 * conteúdo velho intacto, e o handler devolvia `ok()`.
 *
 * `LoggerService.clear()` engolia a falha do `writeFileSync` num
 * `console.error` — o mesmo `ok()` mentiroso, com `sigaa-me.log` no disco.
 *
 * fs de verdade em pasta temporária: o primeiro bug é de ordenação de I/O e um
 * mock de `fs` não o reproduz.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Só `process.env` aqui: `vi.hoisted` roda antes dos imports do módulo, então
// `os`/`path` ainda não existem.
const userDataPath = vi.hoisted(
    () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sigaa-me-log-reset-${process.pid}`,
);

// `logger.service.ts` constrói um singleton no import: a pasta precisa existir
// antes de o mock ser consultado.
vi.mock('electron', async () => {
    const fs = await import('node:fs');
    fs.mkdirSync(userDataPath, { recursive: true });
    return { app: { getPath: () => userDataPath } };
});

import { HttpScraperService } from '../../electron/services/http-scraper.service';
import { LoggerService } from '../../electron/services/logger.service';

describe('DATA-002 — zerar os logs em disco', () => {
    beforeEach(() => {
        fs.mkdirSync(userDataPath, { recursive: true });
        // `log()` também escreve no console; 20k linhas de ruído não ajudam.
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('HttpScraperService.resetLog trunca scraper.log mesmo com escrita ainda no buffer', async () => {
        const scraper = new HttpScraperService();
        // Enfileira ~2 MB que ainda não chegaram ao disco: é exatamente o que o
        // stream antigo despeja em cima do arquivo já truncado.
        for (let i = 0; i < 20_000; i++) scraper.resetSession();

        await scraper.resetLog();
        await new Promise((resolve) => setTimeout(resolve, 500));

        expect(fs.statSync(path.join(userDataPath, 'scraper.log')).size).toBeLessThan(1024);
    });

    it('LoggerService.clear propaga a falha em vez de deixar o log sobreviver em silêncio', () => {
        const logger = new LoggerService();
        logger.info('linha da conta anterior');

        // Falha de escrita sem mock de `fs`: uma pasta ocupando o caminho do
        // log faz o `writeFileSync` estourar como um arquivo travado faria.
        fs.rmSync(logger.getLogPath(), { force: true });
        fs.mkdirSync(logger.getLogPath());

        expect(() => logger.clear()).toThrow();
    });
});
