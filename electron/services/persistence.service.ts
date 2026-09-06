import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// AppSettings vive em shared/ipc.ts porque atravessa o IPC (o renderer lê via
// getSettings e escreve via updateSetting). Reexportado aqui para não quebrar
// os imports existentes.
export type { AppSettings } from '../../shared/ipc';
import type { AppSettings, SettingUpdate } from '../../shared/ipc';

export interface StoredCredentials {
    username: string;
    password: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'light',
    autoSync: true,
    lastDownloadPath: null,
    runInBackground: true,
    syncInterval: 60,
    autoDownloadUpdates: true,
    openAtLogin: false
};

const SETTINGS_SCHEMA_VERSION = 1;

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validador por chave (DATA-001). É a allowlist do `settings.json`: uma chave
 * sem entrada aqui — `schemaVersion`, `junk`, o que for — nunca chega ao
 * `getSettings()`, e um valor com o tipo errado cai no default *daquela*
 * chave em vez de contaminar o objeto inteiro.
 */
const VALIDATORS: { [K in keyof Required<AppSettings>]: (value: unknown) => value is Required<AppSettings>[K] } = {
    theme: (v): v is 'light' | 'dark' => v === 'light' || v === 'dark',
    autoSync: isBoolean,
    lastDownloadPath: (v): v is string | null => typeof v === 'string' || v === null,
    runInBackground: isBoolean,
    syncInterval: (v): v is number => isFiniteNumber(v) && v > 0,
    autoDownloadUpdates: isBoolean,
    lastBackgroundSync: isFiniteNumber,
    openAtLogin: isBoolean,
};

export class PersistenceService {
    private settingsPath: string;
    private credentialsPath: string;
    private settings: AppSettings;

    constructor() {
        this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
        this.credentialsPath = path.join(app.getPath('userData'), 'credentials.json');
        this.settings = this.loadSettings();
    }

    /**
     * A forma plana não muda com o `schemaVersion`, então não há migração: um
     * arquivo escrito antes do campo existir é lido pelas mesmas regras. O que
     * o campo compra é poder detectar a próxima mudança de forma.
     */
    private loadSettings(): AppSettings {
        const settings: AppSettings = { ...DEFAULT_SETTINGS };
        try {
            if (!fs.existsSync(this.settingsPath)) return settings;

            const stored = JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) as Record<string, unknown>;
            if (typeof stored !== 'object' || stored === null) return settings;

            for (const key of Object.keys(VALIDATORS) as (keyof Required<AppSettings>)[]) {
                if (!(key in stored)) continue;
                if (VALIDATORS[key](stored[key])) Object.assign(settings, { [key]: stored[key] });
                else console.warn(`PersistenceService: Ignoring "${key}" — stored value has the wrong type.`);
            }
        } catch (error) {
            console.error('PersistenceService: Failed to load settings:', error);
        }
        return settings;
    }

    public getSettings(): AppSettings {
        return { ...this.settings };
    }

    public updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
        this.settings[key] = value;
        this.saveSettings();
    }

    /**
     * Aplica uma alteração vinda do renderer.
     *
     * Existe separado de `updateSetting` por uma limitação do TypeScript: ele
     * não correlaciona `key` e `value` quando os dois vêm de uma união
     * discriminada, então `updateSetting(update.key, update.value)` não
     * compila. `Object.assign` resolve sem precisar de cast — e a fronteira,
     * que é o que importa, continua estritamente tipada.
     */
    public applySetting(update: SettingUpdate) {
        Object.assign(this.settings, { [update.key]: update.value });
        this.saveSettings();
    }

    /**
     * Store only an OS-encrypted password. Session cookies remain in the
     * Playwright context and are intentionally never written to settings.json.
     */
    public saveCredentials(username: string, password: string): void {
        if (!safeStorage.isEncryptionAvailable()) {
            throw new Error('Secure credential storage is unavailable. Enable your OS keychain before selecting "Remember me".');
        }

        try {
            const encryptedPassword = safeStorage.encryptString(password);
            fs.writeFileSync(this.credentialsPath, JSON.stringify({
                username,
                password: encryptedPassword.toString('base64')
            }));
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Unable to store encrypted credentials: ${message}`);
        }
    }

    /**
     * A corrupt credential store must not stop settings from loading or the
     * user from returning to the regular login flow.
     */
    public loadCredentials(): StoredCredentials | null {
        if (!fs.existsSync(this.credentialsPath)) {
            return null;
        }

        if (!safeStorage.isEncryptionAvailable()) {
            console.warn('PersistenceService: Secure credential storage is unavailable. Skipping auto-login.');
            return null;
        }

        try {
            const data = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8')) as { username?: unknown; password?: unknown };
            if (typeof data.username !== 'string' || typeof data.password !== 'string') {
                throw new Error('Credential payload is missing a username or encrypted password.');
            }

            return {
                username: data.username,
                password: safeStorage.decryptString(Buffer.from(data.password, 'base64'))
            };
        } catch (error) {
            console.error('PersistenceService: Failed to load encrypted credentials:', error);
            return null;
        }
    }

    public clearCredentials(): void {
        try {
            if (fs.existsSync(this.credentialsPath)) {
                fs.unlinkSync(this.credentialsPath);
            }
        } catch (error) {
            console.error('PersistenceService: Failed to clear encrypted credentials:', error);
        }
    }

    private saveSettings() {
        try {
            fs.writeFileSync(this.settingsPath, JSON.stringify({ schemaVersion: SETTINGS_SCHEMA_VERSION, ...this.settings }, null, 2));
        } catch (error) {
            console.error('PersistenceService: Failed to save settings:', error);
        }
    }
}

export const persistenceService = new PersistenceService();
