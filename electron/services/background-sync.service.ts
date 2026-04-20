import { app, Notification } from 'electron';
import { SigaaService } from './sigaa.service';
import { persistenceService } from './persistence.service';
import { cacheService } from './cache.service';
import * as fs from 'fs';
import * as path from 'path';

export class BackgroundSyncService {
    private sigaaService: SigaaService;
    private intervalId: NodeJS.Timeout | null = null;
    private isSyncing = false;

    constructor(sigaaService: SigaaService) {
        this.sigaaService = sigaaService;
    }

    public start() {
        this.stop();
        const settings = persistenceService.getSettings();
        if (!settings.runInBackground) return;
        
        const intervalMs = settings.syncInterval * 60 * 1000;
        console.log(`[BackgroundSync] Starting sync scheduler every ${settings.syncInterval} minutes`);
        this.intervalId = setInterval(() => this.syncNow(), intervalMs);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log('[BackgroundSync] Stopped sync scheduler');
        }
    }

    public restart() {
        this.start();
    }

    private loadCredentials() {
        const credPath = path.join(app.getPath('userData'), 'credentials.json');
        if (fs.existsSync(credPath)) {
            // Using a simple read since safeStorage decryption is needed...
            // It might be better to expose a helper in main, but since safeStorage
            // is available in main process context:
            const { safeStorage } = require('electron');
            try {
                const data = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
                const password = safeStorage.decryptString(Buffer.from(data.password, 'base64'));
                return { username: data.username, password };
            } catch (e) {
                console.error('[BackgroundSync] Failed to load credentials', e);
            }
        }
        return null;
    }

    public async syncNow() {
        if (this.isSyncing) {
            console.log('[BackgroundSync] Already syncing, skipping...');
            return;
        }

        const settings = persistenceService.getSettings();
        if (!settings.runInBackground) return;

        this.isSyncing = true;
        console.log('[BackgroundSync] Triggering background sync...');

        try {
            // 1. Ensure logged in
            const creds = this.loadCredentials();
            if (!creds) {
                console.log('[BackgroundSync] No credentials found. Aborting sync.');
                return;
            }

            // A quiet background login (or session verification)
            // sigaaService.login handles reuse if Playwright is already authenticated, 
            // but we might just try to fetch courses and if it fails, relogin.
            const coursesResult = await this.sigaaService.getCourses();
            let courses = coursesResult.courses;

            if (!coursesResult.success) {
                console.log('[BackgroundSync] Session expired or invalid. Attempting re-login...');
                const loginResult = await this.sigaaService.login(creds.username, creds.password);
                if (!loginResult.success) {
                    console.error('[BackgroundSync] Re-login failed:', loginResult.message);
                    return;
                }
                const retryCourses = await this.sigaaService.getCourses();
                courses = retryCourses.courses;
            }

            if (!courses || courses.length === 0) {
                console.log('[BackgroundSync] No courses found to sync.');
                return;
            }

            let notificationsTriggered = 0;

            for (const course of courses) {
                console.log(`[BackgroundSync] Checking course: ${course.name}`);
                
                // Wait briefly to avoid hammering the SIGAA server
                await new Promise(resolve => setTimeout(resolve, 2000));

                const contentResult = await this.sigaaService.getCourseFiles(course.id, course.name);
                
                if (contentResult.success) {
                    const currentFiles = contentResult.files || [];
                    const currentNews = contentResult.news || [];

                    const diff = cacheService.diffCourseState(course.id, currentFiles, currentNews);

                    if (diff.newFiles.length > 0 || diff.newNews.length > 0) {
                        console.log(`[BackgroundSync] Found ${diff.newFiles.length} new files and ${diff.newNews.length} new news in ${course.name}`);
                        
                        let body = '';
                        if (diff.newFiles.length > 0) body += `${diff.newFiles.length} novo(s) arquivo(s). `;
                        if (diff.newNews.length > 0) body += `${diff.newNews.length} nova(s) notícia(s).`;

                        // Send OS Notification
                        if (Notification.isSupported()) {
                            const notification = new Notification({
                                title: `SIGAA-ME: ${course.name.substring(0, 30)}...`,
                                body: body,
                                icon: path.join(process.env.VITE_PUBLIC || path.join(app.getAppPath(), 'dist'), 'icon.png')
                            });
                            notification.show();
                            notificationsTriggered++;
                        }

                        // Auto-download new files
                        if (settings.autoDownloadUpdates && diff.newFiles.length > 0 && settings.lastDownloadPath) {
                            console.log('[BackgroundSync] Auto-downloading new files...');
                            // Create mini queue
                            const filesToDownload = diff.newFiles.map(f => ({ name: f.name, url: f.url, script: f.script }));
                            await this.sigaaService.downloadAllFiles(
                                course.id,
                                course.name,
                                filesToDownload,
                                settings.lastDownloadPath,
                                {} // Empty downloaded files dict (handled by base path)
                            );
                        }

                        // Update cache
                        const allFileIds = currentFiles.map(f => String(f.id)).filter(id => id && id !== 'undefined');
                        const allNewsIds = currentNews.map(n => String(n.id)).filter(id => id && id !== 'undefined');
                        cacheService.updateCourseState(course.id, allFileIds, allNewsIds);
                    }
                } else {
                    console.warn(`[BackgroundSync] Failed to fetch content for ${course.name}: ${contentResult.message}`);
                }
            }

            console.log(`[BackgroundSync] Sync complete. Triggered ${notificationsTriggered} notifications.`);

        } catch (error) {
            console.error('[BackgroundSync] Error during sync:', error);
        } finally {
            this.isSyncing = false;
        }
    }
}
