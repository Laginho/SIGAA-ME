import { app, BrowserWindow, Notification, safeStorage } from 'electron';
import { SigaaService } from './sigaa.service';
import { persistenceService } from './persistence.service';
import { cacheService } from './cache.service';
import * as fs from 'fs';
import * as path from 'path';

export class BackgroundSyncService {
    private sigaaService: SigaaService;
    private intervalId: NodeJS.Timeout | null = null;
    private isSyncing = false;
    private getWindow: () => BrowserWindow | null;

    constructor(sigaaService: SigaaService, getWindow?: () => BrowserWindow | null) {
        this.sigaaService = sigaaService;
        this.getWindow = getWindow || (() => null);
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

            let totalNewFiles = 0;
            let totalNewNews = 0;
            let coursesWithUpdates = 0;
            let singleCourseUpdateName = '';
            const allCoursesData: any[] = [];

            for (const course of courses) {
                console.log(`[BackgroundSync] Checking course: ${course.name}`);
                
                // Wait briefly to avoid hammering the SIGAA server
                await new Promise(resolve => setTimeout(resolve, 2000));

                const contentResult = await this.sigaaService.getCourseFiles(course.id, course.name);
                
                if (contentResult.success) {
                    const currentFiles = contentResult.files || [];
                    const currentNews = contentResult.news || [];

                    // Collect full course data for frontend update
                    allCoursesData.push({
                        ...course,
                        files: currentFiles,
                        news: currentNews,
                        fileCount: currentFiles.length
                    });

                    const diff = cacheService.diffCourseState(course.id, currentFiles, currentNews);

                    if (diff.newFiles.length > 0 || diff.newNews.length > 0) {
                        console.log(`[BackgroundSync] Found ${diff.newFiles.length} new files and ${diff.newNews.length} new news in ${course.name}`);
                        
                        totalNewFiles += diff.newFiles.length;
                        totalNewNews += diff.newNews.length;
                        coursesWithUpdates++;
                        singleCourseUpdateName = course.name;

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

            console.log(`[BackgroundSync] Sync complete.`);
            persistenceService.updateSetting('lastBackgroundSync', Date.now());

            // Push updated data to renderer
            if (allCoursesData.length > 0) {
                const window = this.getWindow();
                if (window && !window.isDestroyed()) {
                    window.webContents.send('background-sync-update', {
                        courses: allCoursesData,
                        timestamp: Date.now()
                    });
                    console.log(`[BackgroundSync] Pushed ${allCoursesData.length} courses to renderer.`);
                }
            }

            // Aggregated Notification
            if (totalNewFiles > 0 || totalNewNews > 0) {
                let body = '';
                if (totalNewFiles > 0) body += `${totalNewFiles} novo(s) arquivo(s). `;
                if (totalNewNews > 0) body += `${totalNewNews} nova(s) notícia(s).`;

                let title = 'SIGAA-ME - Atualizações';
                if (coursesWithUpdates === 1) {
                    title = `SIGAA-ME: ${singleCourseUpdateName.substring(0, 30)}...`;
                }

                if (Notification.isSupported()) {
                    const notification = new Notification({
                        title: title,
                        body: body,
                        icon: path.join(process.env.VITE_PUBLIC || path.join(app.getAppPath(), 'dist'), 'icon.png')
                    });
                    notification.show();
                    console.log(`[BackgroundSync] Triggered generic notification for ${coursesWithUpdates} course(s).`);
                }
            }

        } catch (error) {
            console.error('[BackgroundSync] Error during sync:', error);
        } finally {
            this.isSyncing = false;
        }
    }
}
