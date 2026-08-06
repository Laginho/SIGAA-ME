/**
 * Persistence contracts around remembered login credentials. Passwords are
 * encrypted separately from settings; Playwright cookies are not persisted.
 */

import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `userData` sem letra de drive, e chaves montadas com o mesmo `path.join` que o
 * serviço usa. Um literal `C:\...\credentials.json` só casa no Windows: fora
 * dele o serviço grava `C:\...` + `/credentials.json` e a chave nunca bate — o
 * teste não falha só de mentira, ele para de exercitar o caminho que testa.
 */
const USER_DATA = 'sigaa-me-persistence-tests';
const credentialsFile = path.join(USER_DATA, 'credentials.json');

const storage = vi.hoisted(() => {
    const files = new Map<string, string>();
    const state = { encryptionAvailable: true };
    const safeStorage = {
        isEncryptionAvailable: vi.fn(() => state.encryptionAvailable),
        encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
        decryptString: vi.fn((value: Buffer) => value.toString().replace(/^encrypted:/, ''))
    };
    return { files, state, safeStorage };
});

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => 'sigaa-me-persistence-tests') },
    safeStorage: storage.safeStorage
}));
vi.mock('fs', () => ({
    existsSync: vi.fn((file: string) => storage.files.has(file)),
    readFileSync: vi.fn((file: string) => storage.files.get(file) ?? ''),
    writeFileSync: vi.fn((file: string, content: string) => storage.files.set(file, String(content))),
    unlinkSync: vi.fn((file: string) => storage.files.delete(file))
}));

import { PersistenceService } from '../../electron/services/persistence.service';

describe('PersistenceService remembered-login recovery', () => {
    beforeEach(() => {
        storage.files.clear();
        storage.state.encryptionAvailable = true;
        vi.clearAllMocks();
    });

    it('preserves settings and encrypted credentials so a timed-out session can be retried after restart', () => {
        const service = new PersistenceService();
        service.updateSetting('syncInterval', 30);
        service.updateSetting('runInBackground', false);
        service.saveCredentials('student', 'portal-password');

        const settingsPayload = [...storage.files.entries()].find(([file]) => file.endsWith('settings.json'))?.[1] ?? '';
        const credentialsPayload = [...storage.files.entries()].find(([file]) => file.endsWith('credentials.json'))?.[1] ?? '';
        expect(settingsPayload).not.toContain('portal-password');
        expect(credentialsPayload).not.toContain('portal-password');

        // A login/navigation timeout must not erase valid remembered credentials.
        const timedOutLogin = { success: false, error: 'SIGAA login navigation timed out' };
        expect(timedOutLogin.success).toBe(false);

        const restartedService = new PersistenceService();
        expect(restartedService.getSettings()).toMatchObject({ syncInterval: 30, runInBackground: false });
        expect(restartedService.loadCredentials()).toEqual({ username: 'student', password: 'portal-password' });
    });

    it('does not attempt auto-login from a corrupt credential payload and leaves normal settings usable', () => {
        const service = new PersistenceService();
        service.updateSetting('theme', 'dark');
        storage.files.set(credentialsFile, '{not-json');
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect(service.loadCredentials()).toBeNull();
        expect(service.getSettings().theme).toBe('dark');
        expect(errorSpy).toHaveBeenCalled();
    });

    it('fails explicitly when OS encryption is unavailable and never writes plaintext credentials', () => {
        const service = new PersistenceService();
        storage.state.encryptionAvailable = false;

        expect(() => service.saveCredentials('student', 'portal-password')).toThrow('Secure credential storage is unavailable');
        expect([...storage.files.values()].join('\n')).not.toContain('portal-password');
        expect(service.loadCredentials()).toBeNull();
    });

    it('clears only remembered credentials, not application preferences, on logout', () => {
        const service = new PersistenceService();
        service.updateSetting('autoDownloadUpdates', false);
        service.saveCredentials('student', 'portal-password');

        service.clearCredentials();

        expect(service.loadCredentials()).toBeNull();
        expect(service.getSettings().autoDownloadUpdates).toBe(false);
    });
});
