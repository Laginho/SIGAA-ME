/**
 * OBS-001 — `LoggerService`: redação, rotação, buffer e `clear()`.
 *
 * `fs` real numa pasta temporária: rotação e a ordem `flush → fecha → apaga`
 * de `clear()` são bugs de I/O de verdade (DATA-002 já mostrou isso com o
 * logger antigo), e um mock de `fs` não os reproduz.
 *
 * `beforeEach`, não `beforeAll`: se um membro do contrato faltar, cada `it`
 * falha pela própria asserção em vez de a suíte inteira virar skipped.
 *
 * Contrato e decisões: `.scratch/05-fase4-prontidao-para-distribuicao/issues/02-OBS-001-*.md`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AxiosError } from 'axios';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => os.tmpdir()), isPackaged: false } }));

import { LoggerService, redact } from '../../electron/services/logger.service';

beforeEach(() => {
    expect(typeof LoggerService).toBe('function');
    expect(typeof LoggerService.prototype.scope).toBe('function');
    expect(typeof LoggerService.prototype.flush).toBe('function');
    expect(typeof LoggerService.prototype.clear).toBe('function');
    expect(typeof redact).toBe('function');
});

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-logger-'));
}

function readLog(dir: string, name = 'app.log'): string {
    const file = path.join(dir, 'logs', name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

describe('redact() — camada (a), sempre, em todo modo', () => {
    it('senha/password/passwd/pwd seguido de = ou : vira [redacted]', () => {
        expect(redact('senha=abc123')).toBe('senha=[redacted]');
        expect(redact('pwd=abc')).toBe('pwd=[redacted]');
        expect(redact('password: hunter2')).toBe('password: [redacted]');
    });

    it('cookie de sessão colapsa o resto da linha', () => {
        expect(redact('JSESSIONID=A.srv1; x=1')).toBe('JSESSIONID=[redacted]');
    });

    it('Cookie:/Set-Cookie: redige o valor inteiro', () => {
        expect(redact('Cookie: a=1; b=2')).toBe('Cookie: [redacted]');
        expect(redact('Set-Cookie: session=xyz; Path=/')).toBe('Set-Cookie: [redacted]');
    });

    it('Authorization', () => {
        expect(redact('Authorization: Bearer t')).toBe('Authorization: [redacted]');
    });

    it('javax.faces.ViewState', () => {
        expect(redact('javax.faces.ViewState=abc123')).toBe('javax.faces.ViewState=[redacted]');
    });

    it('jsfcljs(...) vira [jsf], mesmo com parênteses aninhados', () => {
        const input = "onclick=\"jsfcljs(document.getElementById('form'),{},'')\"";
        const out = redact(input);
        expect(out).toContain('[jsf]');
        expect(out).not.toContain('jsfcljs');
    });

    it('HTML a partir do primeiro < vira [html omitted] até o fim', () => {
        expect(redact('resposta: <html><body>oi</body></html>')).toBe('resposta: [html omitted]');
    });

    it('caminho absoluto Windows e POSIX', () => {
        expect(redact('em C:\\Users\\aluno\\arquivo.txt')).toBe('em [path]');
        expect(redact('em /home/aluno/arquivo.txt')).toBe('em [path]');
    });

    it('corta linha maior que 4096 chars, com marcador', () => {
        const big = 'x'.repeat(5000);
        const out = redact(big);
        expect(out.length).toBeLessThan(5000);
        expect(out).toContain('[truncated]');
    });
});

describe('LoggerService', () => {
    let dir: string;

    beforeEach(() => {
        dir = makeTmpDir();
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    function makeLogger(overrides: { maxFileBytes?: number; maxFiles?: number; production?: boolean } = {}) {
        const production = overrides.production ?? false;
        return new LoggerService({
            userDataPath: () => dir,
            production: () => production,
            maxFileBytes: overrides.maxFileBytes,
            maxFiles: overrides.maxFiles,
        });
    }

    it('não chama userDataPath no construtor, só no primeiro write', async () => {
        const provider = vi.fn(() => dir);
        const logger = new LoggerService({ userDataPath: provider, production: () => false });

        expect(provider).not.toHaveBeenCalled();

        logger.info('primeira linha');
        await logger.flush();

        expect(provider).toHaveBeenCalled();
    });

    it('scope() prefixa [Componente]; info/warn/error sem scope usam [main]', async () => {
        const logger = makeLogger();
        logger.info('mensagem simples');
        logger.scope('HttpScraper').warn('outra mensagem');

        await logger.flush();

        const content = readLog(dir);
        expect(content).toContain('[main]');
        expect(content).toContain('mensagem simples');
        expect(content).toContain('[HttpScraper]');
        expect(content).toContain('outra mensagem');
    });

    it('assinatura de transição: argumento primitivo vira String() redigido', async () => {
        const logger = makeLogger();
        logger.info('contagem', 42, 'C:\\Users\\aluno\\a.txt');

        await logger.flush();

        const content = readLog(dir);
        expect(content).toContain('42');
        expect(content).toContain('[path]');
        expect(content).not.toContain('Users\\aluno');
    });

    it('assinatura de transição: objeto plano em produção redige chave de conteúdo e de segredo', async () => {
        const logger = makeLogger({ production: true });
        logger.info('novo arquivo', { courseName: 'Cálculo I', password: 'segredo' });

        await logger.flush();

        const content = readLog(dir);
        expect(content).not.toContain('Cálculo I');
        expect(content).not.toContain('segredo');
        expect(content).toContain('[redacted]');
    });

    it('em dev, chave de conteúdo passa; chave de segredo continua redigida', async () => {
        const logger = makeLogger({ production: false });
        logger.info('novo arquivo', { courseName: 'Cálculo I', password: 'segredo' });

        await logger.flush();

        const content = readLog(dir);
        expect(content).toContain('Cálculo I');
        expect(content).not.toContain('segredo');
    });

    it('Error vira { name, message, code }; stack só em dev', async () => {
        const err = Object.assign(new Error('deu ruim'), { code: 'ECONNRESET' });

        const prodLogger = makeLogger({ production: true });
        prodLogger.error('falhou', err);
        await prodLogger.flush();
        const prodContent = readLog(dir);
        expect(prodContent).toContain('ECONNRESET');
        expect(prodContent).toContain('deu ruim');
        expect(prodContent).not.toMatch(/at .*logger-redaction/);

        const devDir = makeTmpDir();
        const devLogger = new LoggerService({ userDataPath: () => devDir, production: () => false });
        devLogger.error('falhou', err);
        await devLogger.flush();
        const devContent = readLog(devDir);
        expect(devContent).toContain('ECONNRESET');
        expect(devContent).toMatch(/"stack"/);
        fs.rmSync(devDir, { recursive: true, force: true });
    });

    it('AxiosError real: o cookie do header não chega ao arquivo, {name,message,code} chega', async () => {
        const axiosErr = new AxiosError(
            'Request failed with status code 500',
            'ERR_BAD_RESPONSE',
            { headers: { Cookie: 'JSESSIONID=abc123def456; outro=1' } } as never,
        );

        const logger = makeLogger({ production: true });
        logger.error('falha http', axiosErr);
        await logger.flush();

        const content = readLog(dir);
        expect(content).not.toContain('abc123def456');
        expect(content).not.toContain('JSESSIONID');
        expect(content).toContain('ERR_BAD_RESPONSE');
        expect(content).toContain('Request failed with status code 500');
    });

    it('rotaciona por tamanho: no máximo maxFiles arquivos, a linha mais nova em app.log', async () => {
        const logger = makeLogger({ maxFileBytes: 300, maxFiles: 3 });
        for (let i = 0; i < 40; i++) logger.info(`linha-${i}`);
        await logger.flush();

        const files = fs.readdirSync(path.join(dir, 'logs'));
        expect(files.sort()).toEqual(['app.1.log', 'app.2.log', 'app.log'].sort());

        const current = readLog(dir);
        expect(current).toContain('linha-39');
        expect(current).not.toContain('linha-0');

        let total = 0;
        for (const file of files) {
            const size = fs.statSync(path.join(dir, 'logs', file)).size;
            expect(size).toBeLessThanOrEqual(300);
            total += size;
        }
        expect(total).toBeLessThanOrEqual(3 * 300);
    });

    it('flush() resolve só depois de tudo estar no disco', async () => {
        const logger = makeLogger();
        logger.info('linha única');

        await logger.flush();

        expect(readLog(dir)).toContain('linha única');
    });

    it('sink impossível: 20 writes não lançam, flush resolve, console.error no máximo uma vez', async () => {
        const blockerFile = path.join(dir, 'not-a-directory');
        fs.writeFileSync(blockerFile, '');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const logger = new LoggerService({ userDataPath: () => blockerFile, production: () => true });

        expect(() => {
            for (let i = 0; i < 20; i++) logger.error(`falha-${i}`);
        }).not.toThrow();

        await expect(logger.flush()).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalledTimes(1);
        errorSpy.mockRestore();
    });

    it('clear() apaga os logs e o logger continua utilizável (reabre preguiçosamente)', async () => {
        const logger = makeLogger();
        logger.info('antes do clear');
        await logger.flush();
        expect(fs.existsSync(path.join(dir, 'logs', 'app.log'))).toBe(true);

        await logger.clear();
        expect(fs.existsSync(path.join(dir, 'logs', 'app.log'))).toBe(false);

        logger.info('depois do clear');
        await logger.flush();
        const content = readLog(dir);
        expect(content).toContain('depois do clear');
        expect(content).not.toContain('antes do clear');
    });

    it('clear() rejeita quando a exclusão falha, e app.log continua no disco', async () => {
        const logger = makeLogger();
        logger.info('linha que não pode sumir');
        await logger.flush();

        const rmSpy = vi.spyOn(fs.promises, 'rm').mockRejectedValueOnce(new Error('EPERM: arquivo em uso'));
        await expect(logger.clear()).rejects.toThrow('EPERM: arquivo em uso');
        rmSpy.mockRestore();

        expect(readLog(dir)).toContain('linha que não pode sumir');

        logger.info('ainda funciona depois da falha');
        await logger.flush();
        expect(readLog(dir)).toContain('ainda funciona depois da falha');
    });

    it('ecoa no console só fora de produção', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const devLogger = makeLogger({ production: false });
        devLogger.info('linha de dev');
        await devLogger.flush();
        expect(logSpy).toHaveBeenCalled();
        logSpy.mockRestore();

        const prodDir = makeTmpDir();
        const logSpy2 = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const prodLogger = new LoggerService({ userDataPath: () => prodDir, production: () => true });
        prodLogger.info('linha de produção');
        await prodLogger.flush();
        expect(logSpy2).not.toHaveBeenCalled();
        logSpy2.mockRestore();
        fs.rmSync(prodDir, { recursive: true, force: true });
    });
});
