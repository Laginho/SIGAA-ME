/**
 * OBS-003 — HTML/JSON cru de depuração, gravado por `DiagnosticsService.saveRaw`,
 * compartilhando pasta e teto de retenção com `record()` (`PORTAL-003`).
 *
 * `electron` é mockado só para `app.getPath` (fixo, pasta temporária) e
 * `app.isPackaged` (mutável via `electronState`, lido a cada chamada — mesmo
 * padrão do getter `dir`, DEV-002). O resto é `fs` real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const userDataPath = vi.hoisted(
    () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sigaa-me-diagnostics-raw-${process.pid}`,
);
const electronState = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
    app: {
        getPath: () => userDataPath,
        get isPackaged() {
            return electronState.isPackaged;
        },
    },
}));

import { DiagnosticsService, type StructuralDiagnostic } from '../../electron/services/diagnostics.service';

function diagnosticAt(timestamp: number): StructuralDiagnostic {
    return {
        timestamp,
        state: 'UNKNOWN',
        urlFamily: '/sigaa/paginaInicial.do',
        title: 'SIGAA',
        selectorCounts: {},
        adapterVersion: 'ufc-sigaa-2026.09-v1',
        domFingerprint: 'x'.repeat(64),
    };
}

const dir = path.join(userDataPath, 'diagnostics');

beforeEach(() => {
    electronState.isPackaged = false;
    fs.mkdirSync(userDataPath, { recursive: true });
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(userDataPath, { recursive: true, force: true });
});

describe('saveRaw — gate de modo', () => {
    it('em produção não cria arquivo nem pasta', () => {
        electronState.isPackaged = true;
        const service = new DiagnosticsService();

        service.saveRaw('debug_login_page.html', '<html></html>');

        expect(fs.existsSync(dir)).toBe(false);
    });

    it('fora de produção grava em diagnostics/, não na raiz do userData', () => {
        const service = new DiagnosticsService();

        service.saveRaw('debug_login_page.html', '<html>conteudo</html>');

        const files = fs.readdirSync(dir);
        expect(files).toHaveLength(1);
        expect(files[0]).toMatch(/^\d+-debug_login_page\.html$/);
        expect(fs.readFileSync(path.join(dir, files[0]), 'utf8')).toBe('<html>conteudo</html>');
        expect(fs.existsSync(path.join(userDataPath, 'debug_login_page.html'))).toBe(false);
    });
});

describe('saveRaw — retenção compartilhada', () => {
    it('15 record() + 10 saveRaw() deixam os 20 mais novos, tanto faz o tipo', () => {
        const service = new DiagnosticsService();
        for (let ts = 1; ts <= 15; ts++) service.record(diagnosticAt(ts));

        let now = 16;
        vi.spyOn(Date, 'now').mockImplementation(() => now++);
        for (let i = 0; i < 10; i++) service.saveRaw(`debug_${i}.html`, '<html></html>');

        const timestamps = fs
            .readdirSync(dir)
            .map((name) => Number(name.split('-')[0]))
            .sort((a, b) => a - b);

        expect(timestamps).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
    });
});

describe('saveRaw — containment', () => {
    it('nome com travessia de caminho fica contido em diagnostics/', () => {
        const service = new DiagnosticsService();

        service.saveRaw('../evil.html', 'a');
        service.saveRaw('..\\..\\evil.html', 'b');

        const files = fs.readdirSync(dir);
        expect(files).toHaveLength(2);
        for (const file of files) {
            const resolved = path.resolve(dir, file);
            expect(resolved.startsWith(dir + path.sep)).toBe(true);
        }
        expect(fs.existsSync(path.join(userDataPath, 'evil.html'))).toBe(false);
        expect(fs.existsSync(path.join(path.dirname(userDataPath), 'evil.html'))).toBe(false);
        expect(fs.existsSync(path.join(userDataPath, '..', 'evil.html'))).toBe(false);
    });
});

describe('prune — robusto a nome fora do padrão', () => {
    it('20 arquivos válidos mais um intruso deixam os 20 válidos, não 19 válidos e o intruso', () => {
        const service = new DiagnosticsService();
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'sujeira.json'), '{}');

        for (let ts = 1; ts <= 20; ts++) service.record(diagnosticAt(ts));

        const files = fs.readdirSync(dir);
        expect(files).toContain('sujeira.json');
        const validTimestamps = files
            .filter((name) => name !== 'sujeira.json')
            .map((name) => Number(name.split('-')[0]))
            .sort((a, b) => a - b);
        expect(validTimestamps).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    });
});

describe('clear() — falha', () => {
    it('rejeita com o erro da exclusão e a pasta continua', async () => {
        const service = new DiagnosticsService();
        service.record(diagnosticAt(1));
        const error = new Error('EPERM: recurso ocupado');
        vi.spyOn(fs.promises, 'rm').mockRejectedValueOnce(error);

        await expect(service.clear()).rejects.toThrow('EPERM: recurso ocupado');

        expect(fs.existsSync(dir)).toBe(true);
    });
});
