/**
 * OBS-006 — `rotate()` não pode travar `writeLine` quando `unlinkSync`/
 * `renameSync` lançam (arquivo rotacionado bloqueado por outro processo).
 *
 * `fs` real numa pasta temporária, como em `logger-redaction.test.ts`: o bug
 * é de I/O de verdade (promise sem `reject`, callback que escapa), um mock
 * de `fs` não reproduz a promise pendente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => os.tmpdir()), isPackaged: false } }));

import { LoggerService } from '../../electron/services/logger.service';

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-logger-rotate-'));
}

describe('LoggerService — rotate() sobrevive a unlink/rename que lançam', () => {
    let dir: string;

    beforeEach(() => {
        dir = makeTmpDir();
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('app.1.log substituído por diretório: writeLine resolve e a próxima linha é gravada', async () => {
        const logsDir = path.join(dir, 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        // app.1.log é um diretório: fs.unlinkSync nele lança dentro do
        // callback de stream.end, e é isso que rotate() precisa sobreviver.
        fs.mkdirSync(path.join(logsDir, 'app.1.log'));

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logger = new LoggerService({
            userDataPath: () => dir,
            production: () => false,
            maxFileBytes: 10,
            maxFiles: 2,
        });

        logger.info('linha antes da rotação');
        logger.info('linha depois da rotação');

        await Promise.race([
            logger.flush(),
            new Promise((_, reject) => {
                setTimeout(() => reject(new Error('timeout: rotate() nunca resolveu')), 2000);
            }),
        ]);

        const content = fs.readFileSync(path.join(logsDir, 'app.log'), 'utf8');
        expect(content).toContain('linha depois da rotação');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        errorSpy.mockRestore();
    });
});
