/**
 * DATA-001 — os dois arquivos JSON do `userData` passam a ter schema versionado
 * e validado em runtime.
 *
 * `cache.json` (CacheService) vira `CacheFileV2`: um balde por conta, e todo
 * método recebe o `accountId` explicitamente — nada de estado escondido no
 * serviço decidindo de quem é o dado. Um arquivo v1 (`{ [courseId]: state }`)
 * não pode ser atribuído a nenhuma conta, então é **descartado** (decisão de
 * migração: reset, não quarentena — é só a linha de base de "já visto"; o
 * custo é um cold start sem notificação). Com o v1 morre a normalização do
 * BUG-009: todo arquivo v2 é escrito depois da correção do parser.
 *
 * `settings.json` (PersistenceService) ganha `schemaVersion: 1` e validação por
 * chave: valor com tipo errado cai no default daquela chave, chave desconhecida
 * não atravessa, e `getSettings()` devolve exatamente `AppSettings`.
 *
 * Vermelho hoje: `getCourseState('acc', 'c1')` trata `'acc'` como courseId e
 * `'c1'` some; o arquivo gravado não tem `schemaVersion`; `getSettings()`
 * devolve o que estiver no disco, `junk` e string em `syncInterval` inclusos.
 */
import * as path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_DATA = 'sigaa-me-schema-tests';
const cacheFile = path.join(USER_DATA, 'cache.json');
const settingsFile = path.join(USER_DATA, 'settings.json');

const storage = vi.hoisted(() => {
    const files = new Map<string, string>();
    const safeStorage = {
        isEncryptionAvailable: vi.fn(() => true),
        encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
        decryptString: vi.fn((value: Buffer) => value.toString().replace(/^encrypted:/, '')),
    };
    return { files, safeStorage };
});

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => 'sigaa-me-schema-tests') },
    safeStorage: storage.safeStorage,
}));
vi.mock('fs', () => ({
    existsSync: vi.fn((file: string) => storage.files.has(file)),
    readFileSync: vi.fn((file: string) => storage.files.get(file) ?? ''),
    writeFileSync: vi.fn((file: string, content: string) => storage.files.set(file, String(content))),
    unlinkSync: vi.fn((file: string) => storage.files.delete(file)),
}));

import { CacheService } from '../../electron/services/cache.service';
import { PersistenceService } from '../../electron/services/persistence.service';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function readCacheFile(): any {
    return JSON.parse(storage.files.get(cacheFile) ?? 'null');
}

describe('CacheService — CacheFileV2, one bucket per account', () => {
    beforeEach(() => {
        storage.files.clear();
        vi.clearAllMocks();
    });

    it('keeps the baseline of account A invisible to account B and intact when A returns', () => {
        const service = new CacheService();
        service.updateCourseState(A, 'c1', ['1', '2'], ['9']);

        expect(service.getCourseState(B, 'c1')).toEqual({ files: [], news: [] });
        expect(service.diffCourseState(B, 'c1', [{ id: '1' }], [{ id: '9' }])).toEqual({
            newFiles: [{ id: '1' }],
            newNews: [{ id: '9' }],
        });

        expect(service.getCourseState(A, 'c1')).toEqual({ files: ['1', '2'], news: ['9'] });
        expect(service.diffCourseState(A, 'c1', [{ id: '1' }, { id: '3' }], [{ id: '9' }])).toEqual({
            newFiles: [{ id: '3' }],
            newNews: [],
        });
    });

    it('persists the v2 shape: schemaVersion 2, accounts[accountId].courses[courseId], updatedAt', () => {
        const service = new CacheService();

        service.updateCourseState(A, 'c1', ['1'], ['9']);

        const file = readCacheFile();
        expect(file.schemaVersion).toBe(2);
        expect(file.accounts[A].courses.c1).toEqual({ files: ['1'], news: ['9'] });
        expect(typeof file.accounts[A].updatedAt).toBe('number');
        expect(file).not.toHaveProperty('c1');
    });

    it('survives a restart: a second instance reads back the per-account baseline', () => {
        new CacheService().updateCourseState(A, 'c1', ['1'], []);

        const restarted = new CacheService();

        expect(restarted.getCourseState(A, 'c1')).toEqual({ files: ['1'], news: [] });
        expect(restarted.getCourseState(B, 'c1')).toEqual({ files: [], news: [] });
    });

    it('discards a legacy v1 file: unscoped baselines cannot be attributed to any account', () => {
        storage.files.set(cacheFile, JSON.stringify({ c1: { files: ["555'", '556'], news: ['9'] } }));

        const service = new CacheService();

        expect(service.getCourseState(A, 'c1')).toEqual({ files: [], news: [] });
        expect(service.diffCourseState(A, 'c1', [{ id: '555' }], [{ id: '9' }]).newFiles).toEqual([{ id: '555' }]);

        service.updateCourseState(A, 'c2', ['7'], []);
        const file = readCacheFile();
        expect(file.schemaVersion).toBe(2);
        expect(file).not.toHaveProperty('c1');
        expect(file.accounts[A].courses).toEqual({ c2: { files: ['7'], news: [] } });
    });

    it('drops malformed account entries instead of trusting them', () => {
        storage.files.set(cacheFile, JSON.stringify({
            schemaVersion: 2,
            accounts: {
                [A]: { courses: { c1: { files: 'not-an-array', news: ['9'] } }, updatedAt: 1 },
                [B]: 'garbage',
            },
        }));

        const service = new CacheService();

        expect(service.getCourseState(A, 'c1')).toEqual({ files: [], news: [] });
        expect(service.getCourseState(B, 'c1')).toEqual({ files: [], news: [] });
        expect(() => service.diffCourseState(A, 'c1', [{ id: '1' }], [])).not.toThrow();
    });

    it('recovers to an empty cache when cache.json is corrupt', () => {
        storage.files.set(cacheFile, '{not-json');

        const service = new CacheService();

        expect(service.getCourseState(A, 'anything')).toEqual({ files: [], news: [] });
    });

    it('forgetLastFile(accountId) only touches that account', () => {
        const service = new CacheService();
        service.updateCourseState(A, 'c1', ['1', '2'], ['9']);
        service.updateCourseState(B, 'c9', ['7'], []);

        expect(service.forgetLastFile(A)).toEqual({ courseId: 'c1', fileId: '2' });
        expect(service.getCourseState(A, 'c1').files).toEqual(['1']);
        expect(service.getCourseState(B, 'c9').files).toEqual(['7']);

        service.updateCourseState(A, 'c1', [], []);
        expect(service.forgetLastFile(A)).toBeNull();
        expect(service.getCourseState(B, 'c9').files).toEqual(['7']);
    });
});

describe('PersistenceService — settings.json versioned and validated', () => {
    const DEFAULTS = {
        theme: 'light',
        autoSync: true,
        lastDownloadPath: null,
        runInBackground: true,
        syncInterval: 60,
        autoDownloadUpdates: true,
        openAtLogin: false,
    };

    beforeEach(() => {
        storage.files.clear();
        vi.clearAllMocks();
    });

    it('falls back to the default of each key whose stored value has the wrong type, and never leaks unknown keys', () => {
        storage.files.set(settingsFile, JSON.stringify({
            schemaVersion: 1,
            theme: 'neon',
            autoSync: 'yes',
            lastDownloadPath: 5,
            runInBackground: 1,
            syncInterval: '60',
            autoDownloadUpdates: null,
            openAtLogin: 'false',
            lastBackgroundSync: 'yesterday',
            junk: true,
        }));

        const service = new PersistenceService();

        expect(service.getSettings()).toEqual(DEFAULTS);
    });

    it('keeps well-typed values from a file written before the version field existed', () => {
        storage.files.set(settingsFile, JSON.stringify({
            theme: 'dark',
            syncInterval: 15,
            lastDownloadPath: 'D:/SIGAA',
            lastBackgroundSync: 123,
            openAtLogin: true,
        }));

        const service = new PersistenceService();

        expect(service.getSettings()).toEqual({
            ...DEFAULTS,
            theme: 'dark',
            syncInterval: 15,
            lastDownloadPath: 'D:/SIGAA',
            lastBackgroundSync: 123,
            openAtLogin: true,
        });
    });

    it('writes schemaVersion 1 alongside the settings', () => {
        const service = new PersistenceService();

        service.updateSetting('theme', 'dark');

        const file = JSON.parse(storage.files.get(settingsFile) ?? 'null');
        expect(file.schemaVersion).toBe(1);
        expect(file.theme).toBe('dark');
        expect(service.getSettings()).not.toHaveProperty('schemaVersion');
    });
});
