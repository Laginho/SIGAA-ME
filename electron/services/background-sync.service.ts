import { app, BrowserWindow, Notification } from 'electron';
import { SigaaService } from './sigaa.service';
import { persistenceService } from './persistence.service';
import { cacheService } from './cache.service';
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
            const creds = persistenceService.loadCredentials();
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
                if (!retryCourses.success) {
                    console.error('[BackgroundSync] Retry after re-login failed:', retryCourses.message ?? 'unknown');
                    return;
                }
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
            const newNotifications: any[] = []; // Structured notifications for the bell
            const pendingCommits: { courseId: string; fileIds: string[]; newsIds: string[] }[] = [];

            for (const course of courses) {
                console.log(`[BackgroundSync] Checking course: ${course.name}`);
                
                // Wait briefly to avoid hammering the SIGAA server
                await new Promise(resolve => setTimeout(resolve, 2000));

                const contentResult = await this.sigaaService.getCourseFiles(course.id, course.name);
                
                if (contentResult.success) {
                    const currentFiles = contentResult.files || [];
                    const currentNews = contentResult.news || [];

                    // Check if this is a cold-start (first sync for this course, no prior cache).
                    // On cold-start, all items appear "new" in the diff, but they're not truly new —
                    // we just populate the baseline and skip notifications.
                    const cachedState = cacheService.getCourseState(course.id);
                    const isColdStart = cachedState.files.length === 0 && cachedState.news.length === 0;

                    const diff = cacheService.diffCourseState(course.id, currentFiles, currentNews);

                    // Defer the baseline commit until after delivery (see flush below) —
                    // committing here would mark items "seen" even if a later throw in
                    // this course (auto-download, news fetch) aborts before the user is told.
                    const allFileIds = currentFiles.map(f => String(f.id)).filter(id => id && id !== 'undefined');
                    const allNewsIds = currentNews.map(n => String(n.id)).filter(id => id && id !== 'undefined');
                    pendingCommits.push({ courseId: course.id, fileIds: allFileIds, newsIds: allNewsIds });

                    if (isColdStart) {
                        console.log(`[BackgroundSync] Cold start for ${course.name} — populating baseline (${currentFiles.length} files, ${currentNews.length} news). No notifications.`);
                    } else if (diff.newFiles.length > 0 || diff.newNews.length > 0) {
                        console.log(`[BackgroundSync] Found ${diff.newFiles.length} new files and ${diff.newNews.length} new news in ${course.name}`);
                        
                        totalNewFiles += diff.newFiles.length;
                        totalNewNews += diff.newNews.length;
                        coursesWithUpdates++;
                        singleCourseUpdateName = course.name;

                        // Build notification items for the bell
                        for (const f of diff.newFiles) {
                            newNotifications.push({
                                id: `file-${course.id}-${f.name}`,
                                type: 'file',
                                courseId: course.id,
                                courseName: course.name,
                                itemId: f.name,
                                itemTitle: f.name,
                                timestamp: Date.now(),
                                read: false
                            });
                        }
                        for (const n of diff.newNews) {
                            newNotifications.push({
                                id: `news-${course.id}-${n.id}`,
                                type: 'news',
                                courseId: course.id,
                                courseName: course.name,
                                itemId: n.id,
                                itemTitle: n.title || 'Nova notícia',
                                timestamp: Date.now(),
                                read: false
                            });
                        }

                        // Auto-download new files
                        if (settings.autoDownloadUpdates && diff.newFiles.length > 0 && settings.lastDownloadPath) {
                            console.log('[BackgroundSync] Auto-downloading new files...');
                            const filesToDownload = diff.newFiles.map(f => ({ name: f.name, url: f.url, script: f.script }));
                            await this.sigaaService.downloadAllFiles(
                                course.id,
                                course.name,
                                filesToDownload,
                                settings.lastDownloadPath
                            );
                        }

                        // Auto-fetch news content for offline access
                        if (settings.autoDownloadUpdates && diff.newNews.length > 0) {
                            console.log(`[BackgroundSync] Auto-fetching content for ${diff.newNews.length} new news items...`);
                            for (const newsItem of diff.newNews) {
                                try {
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    const detail = await this.sigaaService.getNewsDetail(course.id, course.name, newsItem.id);
                                    if (detail.success && detail.news) {
                                        // Inject content into the news array so it's cached
                                        const target = currentNews.find((n: any) => n.id === newsItem.id);
                                        if (target) {
                                            target.content = detail.news.content;
                                            console.log(`[BackgroundSync] Cached content for news "${newsItem.title}"`);
                                        }
                                    }
                                } catch (e) {
                                    console.warn(`[BackgroundSync] Failed to fetch content for news "${newsItem.title}":`, e);
                                }
                            }
                        }
                    }

                    // Collect full course data for frontend update (after content enrichment)
                    allCoursesData.push({
                        ...course,
                        files: currentFiles,
                        news: currentNews,
                        fileCount: currentFiles.length
                    });
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
                        notifications: newNotifications,
                        timestamp: Date.now()
                    });
                    console.log(`[BackgroundSync] Pushed ${allCoursesData.length} courses and ${newNotifications.length} notifications to renderer.`);
                }
            }

            // Aggregated OS Notification
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

            // Commit the baseline only after the user had every chance to be told.
            // A crash before this point means re-notifying next sync — the renderer
            // dedupes notification ids, so duplicates are absorbed (notification-store.ts:111-118).
            for (const c of pendingCommits) {
                cacheService.updateCourseState(c.courseId, c.fileIds, c.newsIds);
            }

        } catch (error) {
            // Load-bearing: a throw here means the baseline flush above never ran,
            // so items involved in this sync stay un-committed and get re-diffed
            // (and re-notified) on the next sync instead of being silently marked seen.
            console.error('[BackgroundSync] Error during sync:', error);
        } finally {
            this.isSyncing = false;
        }
    }
}
