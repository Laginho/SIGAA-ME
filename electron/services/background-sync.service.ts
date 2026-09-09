import { app, BrowserWindow, Notification } from 'electron';
import { SigaaService } from './sigaa.service';
import { persistenceService } from './persistence.service';
import { cacheService } from './cache.service';
import { getActiveAccount } from './account-context.service';
import { logger } from './logger.service';
import * as path from 'path';
import type { CourseSnapshot, CourseSummary, NotificationItem } from '../../shared/domain';
import type { BackgroundSyncUpdate } from '../../shared/ipc';
import { isRetryable } from '../../shared/errors';
import type { AppSettings } from '../../shared/ipc';

const log = logger.scope('BackgroundSync');

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
        log.info(`Starting sync scheduler every ${settings.syncInterval} minutes.`);
        this.intervalId = setInterval(() => this.syncNow(), intervalMs);
    }

    public stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            log.info('Stopped sync scheduler.');
        }
    }

    public restart() {
        this.start();
    }

    /**
     * Resolve de imediato sem sync em voo. Com um em voo, pede a parada e só
     * resolve quando ele efetivamente parar — logout e clear-all aguardam isto
     * antes de fechar o navegador por baixo dele.
     */
    public cancel(): Promise<void> {
        return this.sigaaService.operations.cancel('background');
    }

    public syncNow(): Promise<void> {
        if (this.isSyncing) {
            log.info('Already syncing, skipping.');
            return Promise.resolve();
        }

        const settings = persistenceService.getSettings();
        if (!settings.runInBackground) return Promise.resolve();

        this.isSyncing = true;
        log.info('Triggering background sync.');
        return this.sigaaService.operations.run('background', signal => this.runSync(settings, signal));
    }

    private async runSync(settings: AppSettings, signal: AbortSignal): Promise<void> {
        try {
            if (signal.aborted) return;
            // 1. Ensure logged in
            const creds = persistenceService.loadCredentials();
            if (!creds) {
                log.info('No credentials found. Aborting sync.');
                return;
            }

            // A quiet background login (or session verification)
            // sigaaService.login handles reuse if Playwright is already authenticated,
            // but we might just try to fetch courses and if it fails, relogin.
            const coursesResult = await this.sigaaService.getCourses();
            let courses: CourseSummary[];

            if (coursesResult.success) {
                courses = coursesResult.data.courses;
            } else if (coursesResult.error.code === 'SESSION_EXPIRED') {
                log.info('Session expired or invalid. Attempting re-login.');
                const loginResult = await this.sigaaService.login(creds.username, creds.password);
                if (!loginResult.success) {
                    log.error('Re-login failed.', { error: loginResult.error.message });
                    return;
                }
                const retryCourses = await this.sigaaService.getCourses();
                if (!retryCourses.success) {
                    log.error('Retry after re-login failed.', { error: retryCourses.error.message });
                    return;
                }
                courses = retryCourses.data.courses;
            } else if (isRetryable(coursesResult.error)) {
                // Portal fora do ar: relogar não ajuda; o próximo ciclo tenta de novo.
                log.warn('Portal unavailable; will retry next cycle.', { error: coursesResult.error.message });
                return;
            } else {
                // Deriva de seletor, pedido inválido ou erro desconhecido: um
                // login automatizado não tem chance de resolver. Aborta sem relogar.
                log.error(`getCourses failed (${coursesResult.error.code}); aborting without re-login.`, { error: coursesResult.error.message });
                return;
            }

            // A conta ativa só é resolvida agora, depois do caminho de
            // re-login: é a conta a quem a sessão pertence de fato. Sem ela o
            // resultado não é de ninguém — não é enviado ao renderer nem vira
            // linha de base (DATA-001).
            const accountId = getActiveAccount();
            if (!accountId) {
                log.warn('No active account; discarding this sync result instead of attributing it to nobody.');
                return;
            }

            if (courses.length === 0) {
                log.info('No courses found to sync.');
                return;
            }

            let totalNewFiles = 0;
            let totalNewNews = 0;
            let coursesWithUpdates = 0;
            let singleCourseUpdateName = '';
            const allCoursesData: CourseSnapshot[] = [];
            const newNotifications: NotificationItem[] = []; // Structured notifications for the bell
            const pendingCommits: { courseId: string; fileIds: string[]; newsIds: string[] }[] = [];

            for (const course of courses) {
                log.info('Checking course.', { courseName: course.name });

                // Wait briefly to avoid hammering the SIGAA server
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Cancelamento checado a cada disciplina (decisão 1 do DATA-002,
                // signal do coordenador desde o CONC-001): nenhuma disciplina a
                // mais é buscada depois de um cancel().
                if (signal.aborted) {
                    log.info('Cancelled; stopping before the next course.');
                    return;
                }

                const contentResult = await this.sigaaService.getCourseFiles(course.id, course.name);

                if (contentResult.success) {
                    const currentFiles = contentResult.data.files;
                    const currentNews = contentResult.data.news;

                    // Check if this is a cold-start (first sync for this course, no prior cache).
                    // On cold-start, all items appear "new" in the diff, but they're not truly new —
                    // we just populate the baseline and skip notifications.
                    const cachedState = cacheService.getCourseState(accountId, course.id);
                    const isColdStart = cachedState.files.length === 0 && cachedState.news.length === 0;

                    const diff = cacheService.diffCourseState(accountId, course.id, currentFiles, currentNews);

                    // Defer the baseline commit until after delivery (see flush below) —
                    // committing here would mark items "seen" even if a later throw in
                    // this course (auto-download, news fetch) aborts before the user is told.
                    const allFileIds = currentFiles.map(f => String(f.id)).filter(id => id && id !== 'undefined');
                    const allNewsIds = currentNews.map(n => String(n.id)).filter(id => id && id !== 'undefined');
                    pendingCommits.push({ courseId: course.id, fileIds: allFileIds, newsIds: allNewsIds });

                    if (isColdStart) {
                        log.info(
                            `Cold start — populating baseline (${currentFiles.length} files, ${currentNews.length} news). No notifications.`,
                            { courseName: course.name }
                        );
                    } else if (diff.newFiles.length > 0 || diff.newNews.length > 0) {
                        log.info(`Found ${diff.newFiles.length} new files and ${diff.newNews.length} new news.`, { courseName: course.name });

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
                            log.info('Auto-downloading new files.');
                            await this.sigaaService.downloadAllFiles(
                                course.id,
                                course.name,
                                diff.newFiles,
                                settings.lastDownloadPath
                            );
                        }

                        // Auto-fetch news content for offline access
                        if (settings.autoDownloadUpdates && diff.newNews.length > 0) {
                            log.info(`Auto-fetching content for ${diff.newNews.length} new news items.`);
                            for (const newsItem of diff.newNews) {
                                if (signal.aborted) return;
                                try {
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                    const detail = await this.sigaaService.getNewsDetail(course.id, course.name, newsItem.id);
                                    if (detail.success) {
                                        // Inject content into the news array so it's cached
                                        const target = currentNews.find(n => n.id === newsItem.id);
                                        if (target) {
                                            target.content = detail.data.content;
                                            log.info('Cached content for news.', { title: newsItem.title });
                                        }
                                    }
                                } catch (e) {
                                    log.warn('Failed to fetch content for news.', { title: newsItem.title, error: e });
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
                    log.warn('Failed to fetch content for course.', { courseName: course.name, error: contentResult.error.message });
                }
            }

            // Cancelado depois da última disciplina: nada é publicado nem commitado.
            if (signal.aborted) {
                log.info('Cancelled; discarding this run before publish/commit.');
                return;
            }

            log.info('Sync complete.');
            persistenceService.updateSetting('lastBackgroundSync', Date.now());

            // Push updated data to renderer
            if (allCoursesData.length > 0) {
                const window = this.getWindow();
                if (window && !window.isDestroyed()) {
                    const update: BackgroundSyncUpdate = {
                        accountId,
                        courses: allCoursesData,
                        notifications: newNotifications,
                        timestamp: Date.now()
                    };
                    window.webContents.send('background-sync-update', update);
                    log.info(`Pushed ${allCoursesData.length} courses and ${newNotifications.length} notifications to renderer.`);
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
                    log.info(`Triggered generic notification for ${coursesWithUpdates} course(s).`);
                }
            }

            // Commit the baseline only after the user had every chance to be told.
            // A crash before this point means re-notifying next sync — the renderer
            // dedupes notification ids, so duplicates are absorbed (notification-store.ts:111-118).
            for (const c of pendingCommits) {
                cacheService.updateCourseState(accountId, c.courseId, c.fileIds, c.newsIds);
            }

        } catch (error) {
            // Load-bearing: a throw here means the baseline flush above never ran,
            // so items involved in this sync stay un-committed and get re-diffed
            // (and re-notified) on the next sync instead of being silently marked seen.
            log.error('Error during sync.', { error });
        } finally {
            this.isSyncing = false;
        }
    }
}
