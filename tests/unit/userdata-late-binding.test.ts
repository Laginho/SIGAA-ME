/**
 * DEV-002: `cacheService`, `persistenceService` e `diagnosticsService` (PORTAL-003)
 * são singletons de módulo, e o
 * `main.ts` só chama `app.setPath('userData', '<nome>-dev')` depois que os
 * imports (içados) já rodaram. Um `app.getPath` no construtor prende os
 * arquivos ao `userData` de produção. O contrato aqui é: nenhum `getPath` no
 * import, e todo acesso a disco resolve o caminho vigente no momento do uso.
 */
import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';

const h = vi.hoisted(() => {
    const files = new Map<string, string>();
    const dirs = { userData: 'sigaa-me-prod' };
    const getPath = vi.fn((_name: string) => dirs.userData);
    return { files, dirs, getPath };
});

vi.mock('electron', () => ({
    app: { getPath: h.getPath },
    safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s: string) => Buffer.from(s, 'utf8'),
        decryptString: (b: Buffer) => b.toString('utf8'),
    },
}));
vi.mock('fs', () => ({
    mkdirSync: vi.fn(),
    readdirSync: vi.fn((dir: string) => [...h.files.keys()]
        .filter(f => f.startsWith(dir + path.sep))
        .map(f => path.basename(f))),
    rmSync: vi.fn((dir: string) => {
        for (const file of [...h.files.keys()]) if (file.startsWith(dir + path.sep)) h.files.delete(file);
    }),
    existsSync: vi.fn((file: string) => h.files.has(file)),
    readFileSync: vi.fn((file: string) => h.files.get(file) ?? ''),
    writeFileSync: vi.fn((file: string, content: string) => h.files.set(file, String(content))),
    unlinkSync: vi.fn((file: string) => h.files.delete(file)),
}));

// Import dos singletons, não das classes: é o que o `main.ts` faz.
import { cacheService } from '../../electron/services/cache.service';
import { persistenceService } from '../../electron/services/persistence.service';
import { diagnosticsService } from '../../electron/services/diagnostics.service';

const PROD = h.dirs.userData;
const DEV = 'sigaa-me-dev';
const ACC = 'a'.repeat(64);

const filesUnder = (dir: string) => [...h.files.keys()].filter(f => f.startsWith(dir + path.sep));

describe('userData resolvido no uso, não no import (DEV-002)', () => {
    it('não chama app.getPath ao importar cache.service, persistence.service e diagnostics.service', () => {
        expect(h.getPath).not.toHaveBeenCalled();
    });

    it('cache.json é lido e gravado no userData vigente depois de um setPath posterior ao import', () => {
        h.files.set(
            path.join(DEV, 'cache.json'),
            JSON.stringify({ schemaVersion: 2, accounts: { [ACC]: { courses: { c1: { files: ['1'], news: [] } }, updatedAt: 1 } } })
        );
        h.dirs.userData = DEV;

        expect(cacheService.getCourseState(ACC, 'c1')).toEqual({ files: ['1'], news: [] });

        cacheService.updateCourseState(ACC, 'c2', ['7'], []);

        expect(JSON.parse(h.files.get(path.join(DEV, 'cache.json'))!).accounts[ACC].courses.c2).toEqual({ files: ['7'], news: [] });
        expect(filesUnder(PROD)).toEqual([]);
    });

    it('settings.json e credentials.json seguem o mesmo userData', () => {
        h.files.set(path.join(DEV, 'settings.json'), JSON.stringify({ schemaVersion: 1, theme: 'dark' }));
        h.dirs.userData = DEV;

        expect(persistenceService.getSettings().theme).toBe('dark');

        persistenceService.updateSetting('syncInterval', 5);
        persistenceService.saveCredentials('user', 'secret');

        expect(JSON.parse(h.files.get(path.join(DEV, 'settings.json'))!).syncInterval).toBe(5);
        expect(h.files.has(path.join(DEV, 'credentials.json'))).toBe(true);
        expect(persistenceService.loadCredentials()).toEqual({ username: 'user', password: 'secret' });
        expect(filesUnder(PROD)).toEqual([]);
    });
    it('o diagnóstico estrutural também cai no userData vigente (PORTAL-003)', () => {
        h.dirs.userData = DEV;

        diagnosticsService.record({
            timestamp: 1,
            state: 'UNKNOWN',
            urlFamily: '/sigaa/paginaInicial.do',
            title: 'SIGAA',
            selectorCounts: {},
            adapterVersion: 'ufc-sigaa-2026.09-v1',
            domFingerprint: 'x'.repeat(64),
        });

        expect(filesUnder(path.join(DEV, 'diagnostics'))).toHaveLength(1);
        expect(filesUnder(PROD)).toEqual([]);
    });
});
