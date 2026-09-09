/**
 * OBS-001 — redação, rotação por tamanho e falha não-recursiva do
 * `LoggerService`. fs de verdade em pasta temporária, como
 * `tests/unit/log-reset.test.ts`: rotação e retenção são efeitos de I/O real
 * (rename/stat), um mock de `fs` não prova a ordem das operações.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const userDataPath = vi.hoisted(
    () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sigaa-me-logger-redaction-${process.pid}`,
);

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => userDataPath) },
}));

import { LoggerService } from '../../electron/services/logger.service';

function readLog(logger: LoggerService): string {
    return fs.readFileSync(logger.getLogPath(), 'utf-8');
}

describe('LoggerService — redação (OBS-001)', () => {
    beforeEach(() => {
        fs.mkdirSync(userDataPath, { recursive: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('redige valores de chaves sensíveis em argumentos estruturados', () => {
        const logger = new LoggerService();
        logger.info('login', {
            password: 'segredo123',
            cookie: 'JSESSIONID=abc123',
            username: 'joao.silva',
            ok: true,
        });

        const content = readLog(logger);
        expect(content).not.toContain('segredo123');
        expect(content).not.toContain('JSESSIONID=abc123');
        expect(content).not.toContain('joao.silva');
        expect(content).toContain('[REDACTED]');
        expect(content).toContain('"ok":true');
    });

    it('redige chaves sensíveis em objetos aninhados, mantendo o resto', () => {
        const logger = new LoggerService();
        logger.info('download concluído', {
            file: { fileName: 'lista1.pdf', courseName: 'Cálculo I', size: 1024 },
        });

        const content = readLog(logger);
        expect(content).not.toContain('lista1.pdf');
        expect(content).not.toContain('Cálculo I');
        expect(content).toContain('"size":1024');
    });

    it('redige padrões sensíveis mesmo em strings livres', () => {
        const logger = new LoggerService();
        logger.info('resposta recebida', 'Cookie: JSESSIONID=xyz; Set-Cookie: outro=1');
        logger.info('cabeçalho', 'Authorization: Bearer abc.def.ghi');
        logger.info('caminho', String.raw`C:\Users\joao\AppData\lista1.pdf`);
        logger.info('viewstate', 'javax.faces.ViewState:j_id1:0');
        logger.info('html', '<!DOCTYPE html><html><body>segredo</body></html>');

        const content = readLog(logger);
        expect(content).not.toContain('JSESSIONID=xyz');
        expect(content).not.toContain('abc.def.ghi');
        expect(content).not.toContain(String.raw`C:\Users\joao`);
        expect(content).not.toContain('j_id1:0');
        expect(content).not.toContain('segredo</body>');
    });

    it('não redige mensagens e dados comuns', () => {
        const logger = new LoggerService();
        logger.info('sincronização concluída', { added: 3, removed: 0 });

        const content = readLog(logger);
        expect(content).toContain('sincronização concluída');
        expect(content).toContain('"added":3');
    });
});

describe('LoggerService — rotação e retenção (OBS-001)', () => {
    beforeEach(() => {
        fs.mkdirSync(userDataPath, { recursive: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('rotaciona o log quando ultrapassa o tamanho máximo, mantendo retenção finita', () => {
        const logger = new LoggerService();
        const line = 'x'.repeat(1024);
        // Bem acima do limite (1 MiB) para forçar mais de uma rotação.
        for (let i = 0; i < 4000; i++) logger.info(line);

        const mainSize = fs.statSync(logger.getLogPath()).size;
        expect(mainSize).toBeLessThan(1024 * 1024);

        const rotated = fs.readdirSync(userDataPath).filter((f) => f.startsWith(path.basename(logger.getLogPath())));
        // arquivo atual + no máximo 2 rotações — retenção finita, não N ilimitado.
        expect(rotated.length).toBeGreaterThan(1);
        expect(rotated.length).toBeLessThanOrEqual(3);
    });

    it('clear remove o log atual e os arquivos rotacionados', () => {
        const logger = new LoggerService();
        const line = 'x'.repeat(1024);
        for (let i = 0; i < 4000; i++) logger.info(line);

        logger.clear();

        const remaining = fs.readdirSync(userDataPath).filter((f) => f.startsWith(path.basename(logger.getLogPath())));
        expect(remaining).toEqual([path.basename(logger.getLogPath())]);
        expect(fs.statSync(logger.getLogPath()).size).toBe(0);
    });
});

describe('LoggerService — falha não-recursiva (OBS-001)', () => {
    beforeEach(() => {
        fs.mkdirSync(userDataPath, { recursive: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('não chama o próprio logger ao falhar a escrita, mesmo em falhas repetidas', () => {
        const logger = new LoggerService();
        logger.info('linha inicial'); // resolve o path e cria o arquivo
        const logPath = logger.getLogPath();

        // fs de verdade, sem spy no módulo: o path vira diretório, então todo
        // `appendFileSync` seguinte falha com EISDIR de verdade.
        fs.rmSync(logPath, { force: true });
        fs.mkdirSync(logPath);

        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(() => {
            for (let i = 0; i < 50; i++) logger.error('falha ao gravar', i);
        }).not.toThrow();

        expect(consoleError).toHaveBeenCalledTimes(50);
    });
});

describe('LoggerService — component scopes e operation IDs (OBS-001)', () => {
    beforeEach(() => {
        fs.mkdirSync(userDataPath, { recursive: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('prefixa linhas com o componente e o operation id do escopo', () => {
        const logger = new LoggerService();
        const scoped = logger.scope('http-scraper', 'op-42');
        scoped.info('baixando arquivo');

        const content = readLog(logger);
        expect(content).toContain('[http-scraper:op-42]');
        expect(content).toContain('baixando arquivo');
    });
});

describe('LoggerService — resolução preguiçosa do caminho (OBS-001)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    it('não chama app.getPath até o primeiro uso', async () => {
        const electron = await import('electron');
        const getPathSpy = electron.app.getPath as unknown as ReturnType<typeof vi.fn>;
        getPathSpy.mockClear();

        const logger = new LoggerService();
        expect(getPathSpy).not.toHaveBeenCalled();

        fs.mkdirSync(userDataPath, { recursive: true });
        logger.info('primeira escrita');
        expect(getPathSpy).toHaveBeenCalled();
    });
});
