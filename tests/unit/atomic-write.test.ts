/**
 * DATA-004 — writeJsonAtomicSync: escreve em `<arquivo>.tmp` e faz `renameSync`
 * por cima do destino. fs real, numa pasta temporária limpa em afterEach.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeJsonAtomicSync } from '../../electron/services/atomic-write';

let tmp: string;

beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'sigaa-me-atomic-write-'));
});

afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

describe('writeJsonAtomicSync', () => {
    it('replaces the previous content on success and leaves no .tmp file behind', () => {
        const filePath = path.join(tmp, 'file.json');
        writeFileSync(filePath, JSON.stringify({ old: true }));

        writeJsonAtomicSync(filePath, { fresh: true });

        expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ fresh: true });
        expect(existsSync(`${filePath}.tmp`)).toBe(false);
    });

    it('propagates a write failure, leaves the destination intact, and leaves no .tmp file behind', () => {
        const filePath = path.join(tmp, 'missing-dir', 'file.json');

        expect(() => writeJsonAtomicSync(filePath, { fresh: true })).toThrow();

        expect(existsSync(filePath)).toBe(false);
        expect(existsSync(`${filePath}.tmp`)).toBe(false);
    });
});
