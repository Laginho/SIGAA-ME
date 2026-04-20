import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface AppSettings {
    theme: 'light' | 'dark';
    autoSync: boolean;
    lastDownloadPath: string | null;
    runInBackground: boolean;
    syncInterval: number; // in minutes
    autoDownloadUpdates: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
    theme: 'light',
    autoSync: true,
    lastDownloadPath: null,
    runInBackground: true,
    syncInterval: 60,
    autoDownloadUpdates: false
};


export class PersistenceService {
    private settingsPath: string;
    private settings: AppSettings;

    constructor() {
        this.settingsPath = path.join(app.getPath('userData'), 'settings.json');
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

    private saveSettings() {
        try {
            fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
        } catch (error) {
            console.error('PersistenceService: Failed to save settings:', error);
        }
    }
}

export const persistenceService = new PersistenceService();
