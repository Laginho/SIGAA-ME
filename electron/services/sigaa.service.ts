import { HttpScraperService, type ParsedFile, type ParsedNews } from './http-scraper.service';
import { PlaywrightLoginService, type ParsedCourse } from './playwright-login.service';
import { logger } from './logger.service';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDownloadTarget, ensureDirInsideRoot, sanitizeSegment } from './download-path';
import type {
    AccountProfile,
    CourseFile,
    CourseSummary,
    DownloadRecord,
    DownloadResult,
    DownloadStatus,
    NewsDetail,
    NewsSummary,
} from '../../shared/domain';
import type { DownloadFileRef } from '../../shared/ipc';
import { type AppResult, errorMessage, fail, failFromMessage, ok } from '../../shared/errors';

// ---------------------------------------------------------------------------
// Redução parser -> domínio (ARCH-001).
//
// É aqui, e só aqui, que `script`, `key`, `href` e `onclick` ficam para trás.
// Tudo que sai desta classe é o que o renderer pode ver; o que o main precisa
// para baixar (o script JSF) é reconstruído da página fresca a cada pedido.
// ---------------------------------------------------------------------------

function toCourseSummary(c: ParsedCourse): CourseSummary {
    return { id: c.id, code: c.code, name: c.name, period: c.period };
}

function toCourseFile(f: ParsedFile): CourseFile {
    return { id: f.id, name: f.name, type: f.type, date: f.date };
}

function toNewsSummary(n: ParsedNews): NewsSummary {
    return { id: n.id, title: n.title, date: n.date, notification: n.notification };
}

/** Script JSF do arquivo na página fresca: pelo id (estável), senão pelo nome. */
function findScript(files: ParsedFile[] | undefined, file: DownloadFileRef): string | undefined {
    if (!files) return undefined;
    const byId = file.id ? files.find(f => f.id === file.id) : undefined;
    return (byId ?? files.find(f => f.name === file.name))?.script;
}

export class SigaaService {
    private playwrightLogin: PlaywrightLoginService;
    private httpScraper: HttpScraperService;

    // Operation state - used for logging and reference counting
    private busyCount = 0;

    constructor() {
        this.playwrightLogin = new PlaywrightLoginService();
        this.httpScraper = new HttpScraperService();
    }

    private startBusy() {
        this.busyCount++;
        logger.info(`SIGAA: Service busy count: ${this.busyCount} (User Action)`);
    }

    private stopBusy() {
        this.busyCount--;
        if (this.busyCount <= 0) {
            this.busyCount = 0;
            logger.info('SIGAA: Service is free.');
        } else {
            logger.info(`SIGAA: Service busy count: ${this.busyCount}`);
        }
    }

    async login(username: string, password: string): Promise<AppResult<AccountProfile>> {
        try {
            logger.info('SIGAA: Attempting login...');
            const result = await this.playwrightLogin.login(username, password);

            if (!result.success) {
                logger.error('SIGAA: Login failed', result.error);
                return failFromMessage(result.error, 'Falha no login');
            }
            if (result.cookies) {
                logger.info('SIGAA: Login successful, setting cookies for HTTP scraper');
                this.httpScraper.setCookies(result.cookies);
            }
            // A foto só existe na página do portal; `getCourses` a devolve.
            return ok({ id: username, name: result.userName || 'User' });
        } catch (error) {
            logger.error('SIGAA: Login error', error);
            return failFromMessage(errorMessage(error));
        }
    }

    async logout(): Promise<void> {
        logger.info('SIGAA: Logging out, closing Playwright session...');
        await this.playwrightLogin.close();
    }

    async getCourses(): Promise<AppResult<{ courses: CourseSummary[]; photoUrl?: string }>> {
        this.startBusy();
        try {
            logger.info('SIGAA: Fetching courses using Playwright...');
            const result = await this.playwrightLogin.getCourses();

            if (!result.success || !result.courses) {
                logger.error('SIGAA: Failed to fetch courses', result.error);
                return failFromMessage(result.error, 'Failed to fetch courses');
            }
            logger.info(`SIGAA: Found ${result.courses.length} courses`);
            return ok({ courses: result.courses.map(toCourseSummary), photoUrl: result.photoUrl });
        } catch (error) {
            logger.error('SIGAA: Error fetching courses', error);
            return failFromMessage(errorMessage(error), 'Failed to fetch courses');
        } finally {
            this.stopBusy();
        }
    }

    async getCourseFiles(courseId: string, courseName: string): Promise<AppResult<{ files: CourseFile[]; news: NewsSummary[] }>> {
        this.startBusy();
        try {
            // 1. Enter course (Lands on Dashboard/Portal)
            logger.info('SIGAA: entering course via Full Browser (Dashboard)...');
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!entryResult.success || !entryResult.html) {
                return failFromMessage(entryResult.error, 'Failed to enter course');
            }

            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
                const ua = await this.playwrightLogin.getUserAgent();
                this.httpScraper.setUserAgent(ua);
            }

            // 2. Parse Dashboard for BOTH files and news
            // Files with download links (jsfcljs...id...) are on the Dashboard, not the Conteúdo page
            logger.info('SIGAA: Parsing Dashboard for files and news...');
            const dashboardParse = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);
            // Antes, falha de parse (sessão expirada, deriva de seletor) virava
            // `success: true` com listas vazias — e uma disciplina vazia no cache.
            if (!dashboardParse.success) {
                return failFromMessage(dashboardParse.error, 'Failed to parse course page');
            }
            const files = (dashboardParse.files ?? []).map(toCourseFile);
            const news = (dashboardParse.news ?? []).map(toNewsSummary);
            logger.info(`SIGAA: Found ${files.length} files and ${news.length} news items on Dashboard.`);

            return ok({ files, news });
        } catch (error) {
            logger.error('SIGAA: Error fetching files:', error);
            return failFromMessage(errorMessage(error), 'Failed to fetch files');
        } finally {
            this.stopBusy();
        }
    }

    /**
     * Plano B do download (BUG-004): só depois que o HTTP falhou duas vezes.
     * `basePath`, não `targetDir`: o DownloadService cria a pasta da turma sozinho.
     */
    private async downloadViaPlaywright(
        courseId: string, courseName: string, fileName: string, basePath: string, script: string
    ): Promise<AppResult<{ filePath: string }>> {
        logger.warn(`SIGAA: HTTP download failed twice for ${fileName}. Falling back to Playwright...`);
        const result = await this.playwrightLogin.downloadFile(courseId, courseName, fileName, '', basePath, {}, script);
        if (result.success && result.filePath) return ok({ filePath: result.filePath });
        return fail('DOWNLOAD_FAILED', result.error || 'Playwright download failed');
    }

    async downloadFile(
        courseId: string,
        courseName: string,
        file: DownloadFileRef,
        basePath: string
    ): Promise<AppResult<{ filePath: string }>> {
        this.startBusy();
        try {
            return await this._downloadFileInternal(courseId, courseName, file, basePath);
        } finally {
            this.stopBusy();
        }
    }

    private async _downloadFileInternal(
        courseId: string,
        courseName: string,
        file: DownloadFileRef,
        basePath: string
    ): Promise<AppResult<{ filePath: string }>> {
        // 0. Prepare Target Directory — resolve and prove containment BEFORE any network
        let targetDir: string;
        try {
            targetDir = resolveDownloadTarget(basePath, courseName, file.name).dir;
            ensureDirInsideRoot(basePath, targetDir);
        } catch (error) {
            return fail('INVALID_REQUEST', errorMessage(error));
        }

        try {
            console.log(`SIGAA: Downloading file ${file.name}...`);

            // 1. Enter course via Full Browser (Dashboard) - Headless API skips valid ViewState for files
            logger.info('SIGAA: Entering course via Full Browser for download (State reliability)...');
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');
            if (!entryResult.success || !entryResult.html) {
                return failFromMessage(entryResult.error, 'Failed to enter course');
            }
            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }

            // 2. Navigate to Files Section (Essential for ViewState)
            logger.info('SIGAA: Navigating to Files Section for download state...');
            const filesNavResult = await this.playwrightLogin.navigateToFilesSection();

            logger.info(`SIGAA: filesNavResult.success=${filesNavResult.success}, hasHtml=${!!filesNavResult.html}, htmlLength=${filesNavResult.html?.length || 0}, error=${filesNavResult.error || 'none'}`);
            if (filesNavResult.html) {
                const titleMatch = filesNavResult.html.match(/<title>(.*?)<\/title>/i);
                logger.info(`SIGAA: filesNavResult page title: "${titleMatch?.[1] || 'unknown'}"`);
            }

            const filesSectionHtml = filesNavResult.success && filesNavResult.html ? filesNavResult.html : null;
            if (!filesSectionHtml) {
                logger.warn('SIGAA: Failed to navigate to files section. Proceeding with Dashboard HTML (likely to fail)...');
            }
            let parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, filesSectionHtml ?? entryResult.html);
            let targetScript = findScript(parseResult.files, file);

            // A lista que o renderer tem veio do Dashboard; a seção de arquivos
            // pode não listar tudo. Antes, o script antigo do renderer cobria
            // esse caso — agora ele não atravessa o IPC, então olhamos a mesma
            // página de onde a lista saiu.
            if (!targetScript && filesSectionHtml) {
                logger.info(`SIGAA: ${file.name} not in files section; scanning Dashboard HTML...`);
                parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);
                targetScript = findScript(parseResult.files, file);
            }
            if (!targetScript) {
                return fail('NOT_FOUND', `O arquivo "${file.name}" não está mais na página da disciplina.`);
            }

            // 3. Use HTTP Scraper for fast download
            console.log(`SIGAA: Attempting fast HTTP download for file ${file.id}...`);
            const httpResult = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, targetScript);

            if (httpResult.success && httpResult.filePath) {
                console.log('SIGAA: HTTP download successful!');
                return ok({ filePath: httpResult.filePath });
            }

            console.warn('SIGAA: HTTP download failed. Refreshing session and retrying HTTP download...', httpResult.error);

            // 4. Refresh Session and Retry (HTTP Only)
            console.log(`SIGAA: Re-entering course ${courseId} to refresh session (Retry Attempt)...`);
            const retryEntryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!retryEntryResult.success || !retryEntryResult.html) {
                return failFromMessage(retryEntryResult.error, 'Failed to refresh session for retry');
            }

            // Update HttpScraper with fresh state
            if (retryEntryResult.cookies) {
                this.httpScraper.setCookies(retryEntryResult.cookies);
            }
            // Parse again to get fresh script
            const retryParseResult = await this.httpScraper.getCourseFiles(courseId, courseName, retryEntryResult.html);
            const retryScript = findScript(retryParseResult.files, file) ?? targetScript;

            // Retry HTTP Download
            console.log(`SIGAA: Retrying HTTP download for file ${file.name}...`);
            const retryHttpResult = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, retryScript);

            if (retryHttpResult.success && retryHttpResult.filePath) {
                console.log('SIGAA: HTTP retry successful!');
                return ok({ filePath: retryHttpResult.filePath });
            }
            return await this.downloadViaPlaywright(courseId, courseName, file.name, basePath, retryScript);

        } catch (error) {
            console.error('SIGAA: Error downloading file:', error);
            return failFromMessage(errorMessage(error), 'Download failed');
        }
    }

    async downloadAllFiles(
        courseId: string,
        courseName: string,
        files: DownloadFileRef[],
        basePath: string,
        onProgress?: (fileName: string, status: DownloadStatus) => void
    ): Promise<AppResult<DownloadResult>> {
        this.startBusy();
        try {
            logger.info(`SIGAA: =====================================`);
            logger.info(`SIGAA: downloadAllFiles called for course ${courseName}`);
            logger.info(`SIGAA: Files received: ${files.length}`);
            logger.info(`SIGAA: basePath: ${basePath}`);

            // Create course subdirectory — single path policy (DL-001)
            const courseSegment = sanitizeSegment(courseName || 'Unknown Course', 100);
            const targetDir = path.join(basePath, courseSegment);
            ensureDirInsideRoot(basePath, targetDir);

            const results: DownloadRecord[] = [];
            let downloaded = 0;
            let skipped = 0;
            let failed = 0;

            // Filter out duplicates first — use sanitized final path for duplicate check (same as writer)
            const queue = files.filter(file => {
                // Check if file exists in the TARGET directory
                let targetFilePath: string;
                try {
                    const { fullPath } = resolveDownloadTarget(basePath, courseName || 'Unknown Course', file.name);
                    targetFilePath = fullPath;
                } catch {
                    // invalid name will fail on download attempt; don't skip as duplicate
                    return true;
                }
                if (fs.existsSync(targetFilePath)) {
                    console.log(`Skipping duplicate (exists on disk): ${file.name}`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped' });
                    if (onProgress) onProgress(file.name, 'skipped');
                    return false;
                }
                return true;
            });

            logger.info(`SIGAA: Queue after filtering: ${queue.length} files to download`);

            // 1. Ensure httpScraper has course session data (viewState, form inputs, etc.)
            // This is REQUIRED for downloads to work - without it, downloadFile returns
            // "Course session data not found" error
            logger.info(`SIGAA: Refreshing course session for batch download...`);

            // Enter course via Playwright to get fresh HTML
            let entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            // If course not found, try re-login and retry
            if (!entryResult.success && entryResult.error?.includes('not found in portal')) {
                logger.warn(`SIGAA: Course not found in portal. Attempting re-login...`);

                // Try to get stored credentials and re-login
                const reloginResult = await this.playwrightLogin.reloginWithStoredCredentials();

                if (reloginResult.success) {
                    logger.info(`SIGAA: Re-login successful. Retrying course entry...`);
                    if (reloginResult.cookies) {
                        this.httpScraper.setCookies(reloginResult.cookies);
                    }

                    // Retry entering the course
                    entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');
                } else {
                    logger.error(`SIGAA: Re-login failed: ${reloginResult.error}`);
                }
            }

            if (!entryResult.success || !entryResult.html) {
                logger.error(`SIGAA: Failed to enter course for batch download: ${entryResult.error}`);
                return failFromMessage(entryResult.error, 'Failed to enter course for download');
            }

            // Set cookies from Playwright session
            if (entryResult.cookies && entryResult.cookies.length > 0) {
                logger.info(`SIGAA: Got ${entryResult.cookies.length} cookies from Playwright`);
                this.httpScraper.setCookies(entryResult.cookies);
            }

            // Parse course page to populate httpScraper.courseData map
            // This is critical - it sets viewState, form inputs, and action URL needed for downloads
            const parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);

            if (!parseResult.success) {
                logger.error(`SIGAA: Failed to parse course files: ${parseResult.error}`);
                return failFromMessage(parseResult.error, 'Failed to parse course for download');
            }

            // O script de cada arquivo vem da página fresca, nunca do renderer.
            const parsedFiles = parseResult.files ?? [];
            let retryParsedFiles: ParsedFile[] | undefined;
            logger.info(`SIGAA: Course session ready. Found ${parsedFiles.length} files on page.`);

            logger.info(`SIGAA: Starting download loop for ${queue.length} files...`);
            for (const file of queue) {
                logger.info(`SIGAA: Processing file: ${file.name}`);

                const targetScript = findScript(parsedFiles, file);
                if (!targetScript) {
                    logger.warn(`SIGAA: Skipping ${file.name} - not found on course page`);
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                    continue;
                }

                logger.info(`SIGAA: Downloading ${file.name} (ID: ${file.id})...`);
                const result = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, targetScript);

                if (result.success && result.filePath) {
                    logger.info(`SIGAA: Downloaded ${file.name} successfully`);
                    downloaded++;
                    results.push({ fileName: file.name, status: 'downloaded', filePath: result.filePath });
                    if (onProgress) onProgress(file.name, 'downloaded');
                } else {
                    logger.error(`SIGAA: Failed to download ${file.name}: ${result.error}`);
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                }
            }

            logger.info(`SIGAA: Download loop complete. Downloaded: ${downloaded}, Failed: ${failed}, Skipped: ${skipped}`);

            // Retry failed files with HTTP (after session refresh)
            if (failed > 0) {
                console.log(`SIGAA: ${failed} files failed HTTP download. Refreshing session and retrying...`);

                // 1. Refresh Session
                const retryEntryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

                if (retryEntryResult.success && retryEntryResult.html) {
                    // Update HttpScraper
                    if (retryEntryResult.cookies) {
                        this.httpScraper.setCookies(retryEntryResult.cookies);
                    }
                    const retryParseResult = await this.httpScraper.getCourseFiles(courseId, courseName, retryEntryResult.html);
                    retryParsedFiles = retryParseResult.files;

                    const failedFiles = results
                        .filter(r => r.status === 'failed')
                        .map(r => files.find(f => f.name === r.fileName))
                        .filter((f): f is DownloadFileRef => f !== undefined);

                    for (const file of failedFiles) {
                        console.log(`SIGAA: Retrying HTTP download for ${file.name} (Attempt 1/3)...`);

                        let retryScript = findScript(retryParsedFiles, file) ?? findScript(parsedFiles, file);
                        if (!retryScript) continue;

                        // Retry Loop
                        let retrySuccess = false;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            if (attempt > 1) console.log(`SIGAA: Retry attempt ${attempt}/3 for ${file.name}...`);

                            const retryResult = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, retryScript);

                            if (retryResult.success && retryResult.filePath) {
                                downloaded++;
                                failed--;
                                // Update result in array
                                const index = results.findIndex(r => r.fileName === file.name);
                                if (index >= 0) {
                                    results[index] = { fileName: file.name, status: 'downloaded', filePath: retryResult.filePath };
                                }
                                if (onProgress) onProgress(file.name, 'downloaded');
                                retrySuccess = true;
                                break; // Success!
                            } else {
                                console.warn(`SIGAA: Retry ${attempt} failed for ${file.name}: ${retryResult.error}`);
                                // Refresh session before next attempt if not last attempt
                                if (attempt < 3) {
                                    const refreshResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');
                                    if (refreshResult.success && refreshResult.cookies) {
                                        this.httpScraper.setCookies(refreshResult.cookies);
                                        // Update script if possible
                                        if (refreshResult.html) {
                                            const newParse = await this.httpScraper.getCourseFiles(courseId, courseName, refreshResult.html);
                                            retryScript = findScript(newParse.files, file) ?? retryScript;
                                        }
                                    }
                                }
                            }
                        }

                        if (!retrySuccess) {
                            console.error(`SIGAA: All retry attempts failed for ${file.name}`);
                        }
                    }
                } else {
                    console.error('SIGAA: Failed to refresh session for batch retry');
                }
            }

            // ponytail: um browser por arquivo no fallback; trocar por playwrightLogin.downloadAllFiles se o lote de falhas for grande com frequência
            for (let i = 0; i < results.length; i++) {
                if (results[i].status !== 'failed') continue;
                const fileName = results[i].fileName;
                const originalFile = files.find(f => f.name === fileName);
                if (!originalFile) continue;
                const script = findScript(retryParsedFiles, originalFile) ?? findScript(parsedFiles, originalFile);
                if (!script) continue;
                const pwResult = await this.downloadViaPlaywright(courseId, courseName, fileName, basePath, script);
                if (pwResult.success) {
                    downloaded++;
                    failed--;
                    results[i] = { fileName, status: 'downloaded', filePath: pwResult.data.filePath };
                    if (onProgress) onProgress(fileName, 'downloaded');
                }
            }

            return ok({ downloaded, skipped, failed, results });
        } catch (error) {
            console.error('SIGAA: Error downloading files:', error);
            return failFromMessage(errorMessage(error), 'Download failed');
        } finally {
            this.stopBusy();
        }
    }

    async getNewsDetail(courseId: string, courseName: string, newsId: string): Promise<AppResult<NewsDetail>> {
        this.startBusy();
        try {
            console.log(`SIGAA: Fetching news detail ${newsId} using Playwright...`);
            // Use Playwright for reliable JSF session handling
            const result = await this.playwrightLogin.getNewsDetail(courseId, courseName, newsId);

            if (!result.success || !result.news) {
                return failFromMessage(result.error, 'Failed to fetch news detail');
            }
            return ok(result.news);
        } catch (error) {
            console.error('SIGAA: Error fetching news detail:', error);
            return failFromMessage(errorMessage(error), 'Failed to fetch news detail');
        } finally {
            this.stopBusy();
        }
    }

    async loadAllNews(courseId: string, courseName: string): Promise<AppResult<NewsSummary[]>> {
        this.startBusy();
        try {
            logger.info(`SIGAA: Loading all news for course ${courseName} (${courseId})...`);

            // 1. Enter Course to get fresh News List (and ViewState)
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName);
            if (!entryResult.success || !entryResult.html) {
                return failFromMessage(entryResult.error, 'Failed to enter course');
            }

            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }

            // 2. Parse News Headers
            const parseResult = await this.httpScraper.getCourseFiles(courseId, 'Unknown', entryResult.html);
            if (!parseResult.success) {
                return failFromMessage(parseResult.error, 'Failed to parse course page');
            }
            const newsItems = parseResult.news ?? [];

            logger.info(`SIGAA: Found ${newsItems.length} news items. Fetching content for all...`);

            // 3. Fetch detail for each news item using Playwright (HTTP scraper fails due to session issues)
            const enrichedNews: NewsSummary[] = [];
            for (const item of newsItems) {
                logger.info(`SIGAA: Fetching content for news "${item.title}"...`);

                // Use Playwright for reliable JSF session handling instead of HTTP scraper
                // The HTTP approach fails because sessions become stale between requests
                const detail = await this.playwrightLogin.getNewsDetail(courseId, courseName, item.id);
                const summary = toNewsSummary(item);

                if (detail.success && detail.news) {
                    enrichedNews.push({ ...summary, content: detail.news.content });
                } else {
                    logger.warn(`SIGAA: Failed to fetch news "${item.title}": ${detail.error}`);
                    enrichedNews.push(summary); // Keep header at least
                }
            }

            return ok(enrichedNews);

        } catch (error) {
            logger.error('SIGAA: Error loading all news:', error);
            return failFromMessage(errorMessage(error));
        } finally {
            this.stopBusy();
        }
    }
}
