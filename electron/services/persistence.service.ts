import { app, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface AppSettings {
    theme: 'light' | 'dark';
    autoSync: boolean;
    lastDownloadPath: string | null;
    runInBackground: boolean;
    syncInterval: number; // in minutes
    autoDownloadUpdates: boolean;
    lastBackgroundSync?: number;
    openAtLogin: boolean;
}

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


export class PersistenceService {
    private settingsPath: string;
    private credentialsPath: string;
    private settings: AppSettings;

    constructor() {
        this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
        this.credentialsPath = path.join(app.getPath('userData'), 'credentials.json');
        this.settings = this.loadSettings();
    }

    private loadSettings(): AppSettings {
        try {
            if (fs.existsSync(this.settingsPath)) {
                const data = fs.readFileSync(this.settingsPath, 'utf8');
                return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
            }
        } catch (error) {
            console.error('PersistenceService: Failed to load settings:', error);
        }
        return { ...DEFAULT_SETTINGS };
    }

    public getSettings(): AppSettings {
        return { ...this.settings };
    }

    public updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
        this.settings[key] = value;
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
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
        } catch (error) {
            console.error('PersistenceService: Failed to save settings:', error);
        }
    }
}

export const persistenceService = new PersistenceService();
