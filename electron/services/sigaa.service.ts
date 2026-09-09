import { HttpScraperService, type ParsedFile, type ParsedNews } from './http-scraper.service';
import { PlaywrightLoginService, type ParsedCourse } from './playwright-login.service';
import { logger } from './logger.service';
import { deriveAccountId, getActiveAccount, setActiveAccount } from './account-context.service';
import { SessionOperationCoordinator } from './session-operation-coordinator.service';
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
import { type AppResult, errorMessage, fail, failFromMessage, failFromResult, ok } from '../../shared/errors';

const log = logger.scope('Sigaa');

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

/**
 * Script JSF do arquivo na página fresca: só pelo id. O nome que acompanha o
 * pedido nunca seleciona qual script executar — só dá nome ao arquivo em
 * disco e guia o Playwright até o link no DOM vivo. Id forjado ou vazio não
 * casa com nada (o chamador decide o fallback sem script).
 */
function findScript(files: ParsedFile[] | undefined, file: DownloadFileRef): string | undefined {
    if (!files || !file.id) return undefined;
    return files.find(f => f.id === file.id)?.script;
}

/** Devolvido pelas checagens de cancelamento; texto livre, os testes só olham o código. */
const CANCELLED = fail('CANCELLED', 'Operação cancelada.');

export class SigaaService {
    private playwrightLogin: PlaywrightLoginService;
    private httpScraper: HttpScraperService;

    /** Único dono da sessão Playwright por vez (CONC-001); troca o `busyCount`, que só contava. */
    readonly operations = new SessionOperationCoordinator();

    constructor() {
        this.playwrightLogin = new PlaywrightLoginService();
        this.httpScraper = new HttpScraperService();
    }

    /**
     * Único ponto de entrada de login manual, auto-login e re-login do sync em
     * background — por isso é aqui que a identidade de conta é amarrada
     * (DATA-001). O que sai daqui é o hash do login, nunca a matrícula: o
     * renderer não precisa dela e não deve tê-la no `sessionStorage`.
     */
    async login(username: string, password: string): Promise<AppResult<AccountProfile>> {
        return this.operations.run('auth', async (signal) => {
            if (signal.aborted) return CANCELLED;
            try {
                const accountId = deriveAccountId(username);
                log.info('Attempting login.');
                const result = await this.playwrightLogin.login(username, password);

                if (!result.success) {
                    log.error('Login failed.', { error: result.error });
                    return failFromResult(result, 'Falha no login');
                }

                // Conta diferente da anterior: o catálogo de sessão do scraper é da
                // conta que saiu e não pode ser reaproveitado. Zera antes de
                // instalar os cookies novos.
                const previous = getActiveAccount();
                if (previous !== null && previous !== accountId) {
                    log.info('Different account signed in; resetting the HTTP scraper session.');
                    this.httpScraper.resetSession();
                }
                setActiveAccount(accountId);

                if (result.cookies) {
                    log.info('Login successful, setting cookies for HTTP scraper.');
                    this.httpScraper.setCookies(result.cookies);
                }
                // A foto só existe na página do portal; `getCourses` a devolve.
                return ok({ id: accountId, name: result.userName || 'User' });
            } catch (error) {
                log.error('Login error.', { error });
                return failFromMessage(errorMessage(error));
            }
        });
    }

    async logout(): Promise<void> {
        return this.operations.run('shutdown', async () => {
            log.info('Logging out, closing Playwright session.');
            this.httpScraper.resetSession();
            setActiveAccount(null);
            // logout(), não close(): close() guarda cookies/credencial de propósito
            // para o próximo sync relançar sozinho (DATA-002).
            await this.playwrightLogin.logout();
        });
    }

    async getCourses(): Promise<AppResult<{ courses: CourseSummary[]; photoUrl?: string }>> {
        return this.operations.run('interactive', async (signal) => {
            if (signal.aborted) return CANCELLED;
            try {
                log.info('Fetching courses using Playwright.');
                const result = await this.playwrightLogin.getCourses();

                if (!result.success || !result.courses) {
                    log.error('Failed to fetch courses.', { error: result.error });
                    return failFromResult(result, 'Failed to fetch courses');
                }
                log.info(`Found ${result.courses.length} courses.`);
                return ok({ courses: result.courses.map(toCourseSummary), photoUrl: result.photoUrl });
            } catch (error) {
                log.error('Error fetching courses.', { error });
                return failFromMessage(errorMessage(error), 'Failed to fetch courses');
            }
        });
    }

    async getCourseFiles(courseId: string, courseName: string): Promise<AppResult<{ files: CourseFile[]; news: NewsSummary[] }>> {
        return this.operations.run('interactive', async (signal) => {
            if (signal.aborted) return CANCELLED;
            try {
                // 1. Enter course (Lands on Dashboard/Portal)
                log.info('Entering course via Full Browser (Dashboard).');
                const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

                if (!entryResult.success || !entryResult.html) {
                    return failFromResult(entryResult, 'Failed to enter course');
                }

                if (entryResult.cookies) {
                    this.httpScraper.setCookies(entryResult.cookies);
                    const ua = await this.playwrightLogin.getUserAgent();
                    this.httpScraper.setUserAgent(ua);
                }

                // 2. Parse Dashboard for BOTH files and news
                // Files with download links (jsfcljs...id...) are on the Dashboard, not the Conteúdo page
                log.info('Parsing Dashboard for files and news.');
                const dashboardParse = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);
                // Antes, falha de parse (sessão expirada, deriva de seletor) virava
                // `success: true` com listas vazias — e uma disciplina vazia no cache.
                if (!dashboardParse.success) {
                    return failFromResult(dashboardParse, 'Failed to parse course page');
                }
                const files = (dashboardParse.files ?? []).map(toCourseFile);
                const news = (dashboardParse.news ?? []).map(toNewsSummary);
                log.info(`Found ${files.length} files and ${news.length} news items on Dashboard.`);

                return ok({ files, news });
            } catch (error) {
                log.error('Error fetching files.', { error });
                return failFromMessage(errorMessage(error), 'Failed to fetch files');
            }
        });
    }

    /**
     * Último recurso do download, no DOM vivo (o Playwright procura o link
     * pelo nome e só usa o script como plano C). Chamado com script depois
     * que o HTTP falhou duas vezes (BUG-004), e sem script quando nenhum
     * parse estático listou o arquivo.
     * `basePath`, não `targetDir`: o DownloadService cria a pasta da turma sozinho.
     */
    private async downloadViaPlaywright(
        courseId: string, courseName: string, fileName: string, basePath: string, script?: string
    ): Promise<AppResult<{ filePath: string }>> {
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
        return this.operations.run('interactive', (signal) => {
            if (signal.aborted) return Promise.resolve(CANCELLED);
            return this._downloadFileInternal(courseId, courseName, file, basePath, signal);
        });
    }

    private async _downloadFileInternal(
        courseId: string,
        courseName: string,
        file: DownloadFileRef,
        basePath: string,
        signal: AbortSignal
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
            log.info('Downloading file.', { fileName: file.name });

            // 1. Enter course via Full Browser (Dashboard) - Headless API skips valid ViewState for files
            log.info('Entering course via Full Browser for download (state reliability).');
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');
            if (!entryResult.success || !entryResult.html) {
                return failFromResult(entryResult, 'Failed to enter course');
            }
            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }

            // 2. Navigate to Files Section (Essential for ViewState)
            log.info('Navigating to files section for download state.');
            const filesNavResult = await this.playwrightLogin.navigateToFilesSection();

            log.info(
                `Files nav result: success=${filesNavResult.success}, hasHtml=${!!filesNavResult.html}, htmlLength=${filesNavResult.html?.length || 0}.`,
                filesNavResult.error ? { error: filesNavResult.error } : undefined
            );
            if (filesNavResult.html) {
                const titleMatch = filesNavResult.html.match(/<title>(.*?)<\/title>/i);
                log.info('Files nav result page title.', { title: titleMatch?.[1] || 'unknown' });
            }

            const filesSectionHtml = filesNavResult.success && filesNavResult.html ? filesNavResult.html : null;
            if (!filesSectionHtml) {
                log.warn('Failed to navigate to files section. Proceeding with Dashboard HTML (likely to fail).');
            }
            let parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, filesSectionHtml ?? entryResult.html);
            let targetScript = findScript(parseResult.files, file);

            // A lista que o renderer tem veio do Dashboard; a seção de arquivos
            // pode não listar tudo. Antes, o script antigo do renderer cobria
            // esse caso — agora ele não atravessa o IPC, então olhamos a mesma
            // página de onde a lista saiu.
            if (!targetScript && filesSectionHtml) {
                log.info('File not in files section; scanning Dashboard HTML.', { fileName: file.name });
                parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);
                targetScript = findScript(parseResult.files, file);
            }
            if (!targetScript) {
                if (signal.aborted) return CANCELLED;
                log.warn('File not in static parses; trying Playwright live-DOM lookup.', { fileName: file.name });
                return await this.downloadViaPlaywright(courseId, courseName, file.name, basePath, undefined);
            }

            // 3. Use HTTP Scraper for fast download
            log.info(`Attempting fast HTTP download for file ${file.id}.`);
            const httpResult = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, targetScript);

            if (httpResult.success && httpResult.filePath) {
                log.info('HTTP download successful.');
                return ok({ filePath: httpResult.filePath });
            }

            log.warn('HTTP download failed. Refreshing session and retrying HTTP download.', { error: httpResult.error });

            // 4. Refresh Session and Retry (HTTP Only)
            if (signal.aborted) return CANCELLED;
            log.info(`Re-entering course ${courseId} to refresh session (retry attempt).`);
            const retryEntryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!retryEntryResult.success || !retryEntryResult.html) {
                return failFromResult(retryEntryResult, 'Failed to refresh session for retry');
            }

            // Update HttpScraper with fresh state
            if (retryEntryResult.cookies) {
                this.httpScraper.setCookies(retryEntryResult.cookies);
            }
            // Parse again to get fresh script
            const retryParseResult = await this.httpScraper.getCourseFiles(courseId, courseName, retryEntryResult.html);
            const retryScript = findScript(retryParseResult.files, file) ?? targetScript;

            // Retry HTTP Download
            log.info('Retrying HTTP download for file.', { fileName: file.name });
            const retryHttpResult = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, retryScript);

            if (retryHttpResult.success && retryHttpResult.filePath) {
                log.info('HTTP retry successful.');
                return ok({ filePath: retryHttpResult.filePath });
            }
            log.warn('HTTP download failed twice. Falling back to Playwright.', { fileName: file.name });
            if (signal.aborted) return CANCELLED;
            return await this.downloadViaPlaywright(courseId, courseName, file.name, basePath, retryScript);

        } catch (error) {
            log.error('Error downloading file.', { error });
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
        return this.operations.run('interactive', async (signal) => {
            if (signal.aborted) return CANCELLED;
            return this._downloadAllFilesInternal(courseId, courseName, files, basePath, signal, onProgress);
        });
    }

    private async _downloadAllFilesInternal(
        courseId: string,
        courseName: string,
        files: DownloadFileRef[],
        basePath: string,
        signal: AbortSignal,
        onProgress?: (fileName: string, status: DownloadStatus) => void
    ): Promise<AppResult<DownloadResult>> {
        try {
            log.info('=====================================');
            log.info('downloadAllFiles called.', { courseName });
            log.info(`Files received: ${files.length}.`);
            log.info('Base path set.', { basePath });

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
                    log.info('Skipping duplicate (exists on disk).', { fileName: file.name });
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped' });
                    if (onProgress) onProgress(file.name, 'skipped');
                    return false;
                }
                return true;
            });

            log.info(`Queue after filtering: ${queue.length} files to download.`);

            // 1. Ensure httpScraper has course session data (viewState, form inputs, etc.)
            // This is REQUIRED for downloads to work - without it, downloadFile returns
            // "Course session data not found" error
            log.info('Refreshing course session for batch download.');

            // Enter course via Playwright to get fresh HTML
            let entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            // If course not found, try re-login and retry
            if (!entryResult.success && entryResult.error?.includes('not found in portal')) {
                log.warn('Course not found in portal. Attempting re-login.');

                // Try to get stored credentials and re-login
                const reloginResult = await this.playwrightLogin.reloginWithStoredCredentials();

                if (reloginResult.success) {
                    log.info('Re-login successful. Retrying course entry.');
                    if (reloginResult.cookies) {
                        this.httpScraper.setCookies(reloginResult.cookies);
                    }

                    // Retry entering the course
                    entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');
                } else {
                    log.error('Re-login failed.', { error: reloginResult.error });
                }
            }

            if (!entryResult.success || !entryResult.html) {
                log.error('Failed to enter course for batch download.', { error: entryResult.error });
                return failFromResult(entryResult, 'Failed to enter course for download');
            }

            // Set cookies from Playwright session
            if (entryResult.cookies && entryResult.cookies.length > 0) {
                log.info(`Got ${entryResult.cookies.length} cookies from Playwright.`);
                this.httpScraper.setCookies(entryResult.cookies);
            }

            // Parse course page to populate httpScraper.courseData map
            // This is critical - it sets viewState, form inputs, and action URL needed for downloads
            const parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);

            if (!parseResult.success) {
                log.error('Failed to parse course files.', { error: parseResult.error });
                return failFromResult(parseResult, 'Failed to parse course for download');
            }

            // O script de cada arquivo vem da página fresca, nunca do renderer.
            // A lista do renderer saiu do Dashboard, mas a seção de arquivos
            // pode listar o que o Dashboard não lista: se algum arquivo da
            // fila ficou sem script, esse segundo parse é consultado depois.
            const parsedFiles = parseResult.files ?? [];
            let filesSectionFiles: ParsedFile[] | undefined;
            if (queue.some((file) => !findScript(parsedFiles, file))) {
                const filesSectionResult = await this.playwrightLogin.navigateToFilesSection();
                if (filesSectionResult.success && filesSectionResult.html) {
                    const sectionParse = await this.httpScraper.getCourseFiles(courseId, courseName, filesSectionResult.html);
                    if (sectionParse.success) {
                        filesSectionFiles = sectionParse.files ?? [];
                    } else {
                        log.warn('Failed to parse files section; proceeding with Dashboard files only.');
                    }
                } else {
                    log.warn('Failed to navigate to files section; proceeding with Dashboard files only.');
                }
            }
            let retryParsedFiles: ParsedFile[] | undefined;
            log.info(`Course session ready. Found ${parsedFiles.length} files on page.`);

            log.info(`Starting download loop for ${queue.length} files.`);
            for (const file of queue) {
                if (signal.aborted) return CANCELLED;
                log.info('Processing file.', { fileName: file.name });

                const targetScript = findScript(parsedFiles, file) ?? findScript(filesSectionFiles, file);
                if (!targetScript) {
                    log.warn('Skipping file - not found on course page.', { fileName: file.name });
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                    continue;
                }

                log.info(`Downloading file ${file.id}.`, { fileName: file.name });
                const result = await this.httpScraper.downloadFile(courseId, file.id, file.name, targetDir, targetScript);

                if (result.success && result.filePath) {
                    log.info(`Downloaded file ${file.id} successfully.`);
                    downloaded++;
                    results.push({ fileName: file.name, status: 'downloaded', filePath: result.filePath });
                    if (onProgress) onProgress(file.name, 'downloaded');
                } else {
                    log.error(`Failed to download file ${file.id}.`, { error: result.error });
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                }
            }

            log.info(`Download loop complete. Downloaded: ${downloaded}, Failed: ${failed}, Skipped: ${skipped}.`);

            // Retry failed files with HTTP (after session refresh)
            if (failed > 0) {
                log.info(`${failed} files failed HTTP download. Refreshing session and retrying.`);

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
                        if (signal.aborted) return CANCELLED;
                        log.info(`Retrying HTTP download for file ${file.id} (attempt 1/3).`);

                        // HTTP sem script não tem como funcionar: segue pulando.
                        let retryScript = findScript(retryParsedFiles, file)
                            ?? findScript(parsedFiles, file)
                            ?? findScript(filesSectionFiles, file);
                        if (!retryScript) continue;

                        // Retry Loop
                        let retrySuccess = false;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            if (signal.aborted) return CANCELLED;
                            if (attempt > 1) log.info(`Retry attempt ${attempt}/3 for file ${file.id}.`);

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
                                log.warn(`Retry ${attempt} failed for file ${file.id}.`, { error: retryResult.error });
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
                            log.error(`All retry attempts failed for file ${file.id}.`);
                        }
                    }
                } else {
                    log.error('Failed to refresh session for batch retry.');
                }
            }

            // ponytail: um browser por arquivo no fallback; trocar por playwrightLogin.downloadAllFiles se o lote de falhas for grande com frequência
            for (let i = 0; i < results.length; i++) {
                if (signal.aborted) return CANCELLED;
                if (results[i].status !== 'failed') continue;
                const fileName = results[i].fileName;
                const originalFile = files.find(f => f.name === fileName);
                if (!originalFile) continue;
                // Sem script, o Playwright procura o link pelo nome no DOM vivo.
                const script = findScript(retryParsedFiles, originalFile)
                    ?? findScript(parsedFiles, originalFile)
                    ?? findScript(filesSectionFiles, originalFile);
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
            log.error('Error downloading files.', { error });
            return failFromMessage(errorMessage(error), 'Download failed');
        }
    }

    async getNewsDetail(courseId: string, courseName: string, newsId: string): Promise<AppResult<NewsDetail>> {
        return this.operations.run('interactive', async (signal) => {
            if (signal.aborted) return CANCELLED;
            try {
                log.info(`Fetching news detail ${newsId} using Playwright.`);
                // Use Playwright for reliable JSF session handling
                const result = await this.playwrightLogin.getNewsDetail(courseId, courseName, newsId);

                if (!result.success || !result.news) {
                    return failFromResult(result, 'Failed to fetch news detail');
                }
                return ok(result.news);
            } catch (error) {
                log.error('Error fetching news detail.', { error });
                return failFromMessage(errorMessage(error), 'Failed to fetch news detail');
            }
        });
    }

    async loadAllNews(courseId: string, courseName: string): Promise<AppResult<NewsSummary[]>> {
        return this.operations.run('interactive', async (signal) => {
            if (signal.aborted) return CANCELLED;
            try {
                log.info(`Loading all news for course ${courseId}.`, { courseName });

                // 1. Enter Course to get fresh News List (and ViewState)
                const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName);
                if (!entryResult.success || !entryResult.html) {
                    return failFromResult(entryResult, 'Failed to enter course');
                }

                if (entryResult.cookies) {
                    this.httpScraper.setCookies(entryResult.cookies);
                }

                // 2. Parse News Headers
                const parseResult = await this.httpScraper.getCourseFiles(courseId, 'Unknown', entryResult.html);
                if (!parseResult.success) {
                    return failFromResult(parseResult, 'Failed to parse course page');
                }
                const newsItems = parseResult.news ?? [];

                log.info(`Found ${newsItems.length} news items. Fetching content for all.`);

                // 3. Fetch detail for each news item using Playwright (HTTP scraper fails due to session issues)
                const enrichedNews: NewsSummary[] = [];
                for (const item of newsItems) {
                    if (signal.aborted) return CANCELLED;
                    log.info(`Fetching content for news ${item.id}.`, { title: item.title });

                    // Use Playwright for reliable JSF session handling instead of HTTP scraper
                    // The HTTP approach fails because sessions become stale between requests
                    const detail = await this.playwrightLogin.getNewsDetail(courseId, courseName, item.id);
                    const summary = toNewsSummary(item);

                    if (detail.success && detail.news) {
                        enrichedNews.push({ ...summary, content: detail.news.content });
                    } else {
                        log.warn(`Failed to fetch news ${item.id}.`, { title: item.title, error: detail.error });
                        enrichedNews.push(summary); // Keep header at least
                    }
                }

                return ok(enrichedNews);

            } catch (error) {
                log.error('Error loading all news.', { error });
                return failFromMessage(errorMessage(error));
            }
        });
    }
}
