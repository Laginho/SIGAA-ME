/**
 * PORTAL-005 — PortalCompatibilityService: contador de falha estrutural e
 * kill-switch persistente. Critérios 1 e 2 do ticket
 * (`.scratch/05-fase4-prontidao-para-distribuicao/issues/08-PORTAL-005-*.md`).
 *
 * fs é real, numa pasta temporária limpa em afterEach — o que se observa é o
 * arquivo em disco, não um mock dele.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import * as fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerSpy = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { scope: () => loggerSpy },
}));

import { PortalCompatibilityService, STRUCTURAL_FAILURE_THRESHOLD } from '../../electron/services/portal-compatibility.service';

let tmp: string;
let filePath: string;

beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-portal-compat-'));
    filePath = path.join(tmp, 'compatibility.json');
    loggerSpy.error.mockClear();
});

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

describe('PortalCompatibilityService — limiar (critério 1)', () => {
    it('duas falhas estruturais seguidas deixam ok e não chamam onChange', () => {
        const onChange = vi.fn();
        const service = new PortalCompatibilityService(filePath, onChange);

        service.recordStructuralFailure('SELECTOR_DRIFT');
        service.recordStructuralFailure('SELECTOR_DRIFT');

        expect(service.status()).toEqual({ state: 'ok' });
        expect(onChange).not.toHaveBeenCalled();
    });

    it('a terceira falha estrutural seguida vira incompatible e chama onChange uma vez', () => {
        const onChange = vi.fn();
        const service = new PortalCompatibilityService(filePath, onChange);

        service.recordStructuralFailure('SELECTOR_DRIFT');
        service.recordStructuralFailure('SELECTOR_DRIFT');
        service.recordStructuralFailure('SELECTOR_DRIFT');

        expect(service.status()).toMatchObject({
            state: 'incompatible',
            failures: STRUCTURAL_FAILURE_THRESHOLD,
            lastCode: 'SELECTOR_DRIFT',
        });
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('recordSuccess zera o contador sem virar incompatible; mais duas falhas continuam ok', () => {
        const onChange = vi.fn();
        const service = new PortalCompatibilityService(filePath, onChange);

        service.recordStructuralFailure('SELECTOR_DRIFT');
        service.recordStructuralFailure('SELECTOR_DRIFT');
        service.recordSuccess();
        service.recordStructuralFailure('SELECTOR_DRIFT');
        service.recordStructuralFailure('SELECTOR_DRIFT');

        expect(service.status()).toEqual({ state: 'ok' });
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('PortalCompatibilityService — persistência (critério 2)', () => {
    it('uma segunda instância sobre o mesmo arquivo lê o flip feito pela primeira', () => {
        const first = new PortalCompatibilityService(filePath, vi.fn());
        first.recordStructuralFailure('SELECTOR_DRIFT');
        first.recordStructuralFailure('SELECTOR_DRIFT');
        first.recordStructuralFailure('SELECTOR_DRIFT');

        const second = new PortalCompatibilityService(filePath, vi.fn());

        expect(second.status()).toMatchObject({ state: 'incompatible', lastCode: 'SELECTOR_DRIFT' });
    });

    it('arquivo ausente lê como ok', () => {
        const service = new PortalCompatibilityService(filePath, vi.fn());

        expect(service.status()).toEqual({ state: 'ok' });
    });

    it('arquivo com JSON inválido lê como ok', () => {
        writeFileSync(filePath, '{not json');
        const service = new PortalCompatibilityService(filePath, vi.fn());

        expect(service.status()).toEqual({ state: 'ok' });
    });

    it('escrita falhando (EPERM) mantém o flip em memória e loga, mas não deixa o arquivo no disco', () => {
        const onChange = vi.fn();
        const service = new PortalCompatibilityService(filePath, onChange);
        const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
            throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
        });

        try {
            service.recordStructuralFailure('SELECTOR_DRIFT');
            service.recordStructuralFailure('SELECTOR_DRIFT');
            service.recordStructuralFailure('SELECTOR_DRIFT');
        } finally {
            write.mockRestore();
        }

        expect(service.status()).toMatchObject({ state: 'incompatible' });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(loggerSpy.error).toHaveBeenCalled();
        expect(existsSync(filePath)).toBe(false);
    });
});
