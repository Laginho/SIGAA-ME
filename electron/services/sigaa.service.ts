import { HttpScraperService } from './http-scraper.service';
import { PlaywrightLoginService } from './playwright-login.service';
import { logger } from './logger.service';
import * as fs from 'fs';
import * as path from 'path';



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



    async login(username: string, password: string): Promise<{ success: boolean; message?: string; account?: { name: string; photoUrl?: string } }> {
        try {
            logger.info('SIGAA: Attempting login...');
            const result = await this.playwrightLogin.login(username, password);

            if (result.success && result.cookies) {
                logger.info('SIGAA: Login successful, setting cookies for HTTP scraper');
                this.httpScraper.setCookies(result.cookies);
            } else {
                logger.error('SIGAA: Login failed', result.error);
            }

            return {
                success: result.success,
                message: result.error,
                account: result.success ? {
                    name: result.userName || 'User',
                    photoUrl: undefined
                } : undefined
            };
        } catch (error: any) {
            logger.error('SIGAA: Login error', error);
            return { success: false, message: error.message };
        }
    }


    async getCourses(): Promise<{ success: boolean; courses?: any[]; photoUrl?: string; message?: string }> {
        try {
            logger.info('SIGAA: Fetching courses using Playwright...');
            // Mark busy
            this.startBusy();
            const result = await this.playwrightLogin.getCourses();
            this.stopBusy();

            if (result.success && result.courses) {
                logger.info(`SIGAA: Found ${result.courses.length || 0} courses`);
            } else {
                logger.error('SIGAA: Failed to fetch courses', result.error);
            }
            return { success: result.success, courses: result.courses, photoUrl: result.photoUrl, message: result.error };
        } catch (error: any) {
            this.stopBusy();
            logger.error('SIGAA: Error fetching courses', error);
            return { success: false, message: error.message || 'Failed to fetch courses' };
        }
    }

    async getCourseFiles(courseId: string, courseName: string): Promise<{ success: boolean; files?: any[]; news?: any[]; message?: string }> {
        this.startBusy();
        try {
            // 1. Enter course (Lands on Dashboard/Portal)
            logger.info('SIGAA: entering course via Full Browser (Dashboard)...');
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!entryResult.success || !entryResult.html) {
                return { success: false, message: entryResult.error || 'Failed to enter course' };
            }

            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
                const ua = await this.playwrightLogin.getUserAgent();
                this.httpScraper.setUserAgent(ua);
            }

            // 2. Parse News (from Dashboard)
            logger.info('SIGAA: Parsing news from Dashboard...');
            const dashboardParse = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);
            const newsItems = dashboardParse.news || [];
            logger.info(`SIGAA: Found ${newsItems.length} news items on Dashboard.`);

            // 3. Navigate to Files Section (Materiais > Conteúdo)
            logger.info('SIGAA: Navigating to Files Section for file scraping...');
            const filesNavResult = await this.playwrightLogin.navigateToFilesSection();

            let filesList: any[] = [];

            if (filesNavResult.success && filesNavResult.html) {
                // 4. Parse Files (from Files Page)
                logger.info('SIGAA: Parsing files from Files Section...');
                // Reuse httpScraper logic, but ignore news from this page (likely duplication or none)
                const filesParse = await this.httpScraper.getCourseFiles(courseId, courseName, filesNavResult.html);
                filesList = filesParse.files || [];
                logger.info(`SIGAA: Found ${filesList.length} files in Files Section.`);
            } else {
                logger.warn('SIGAA: Failed to navigate to Files Section. Files list might be incomplete.', filesNavResult.error);
                // Fallback: Use whatever we found on dashboard (likely 0)
                filesList = dashboardParse.files || [];
            }

            logger.info(`SIGAA: Parsed ${courseName} - Total Files: ${filesList.length}, Total News: ${newsItems.length}`);

            return { success: true, files: filesList, news: newsItems };
        } catch (error: any) {
            logger.error('SIGAA: Error fetching files:', error);
            return { success: false, message: error.message || 'Failed to fetch files' };
        } finally {
            this.stopBusy();
        }
    }



    // Helper to sanitize folder names
    private sanitizeFolderName(name: string): string {
        return name.replace(/[<>:"/\\|?*]/g, '').trim();
    }

    async downloadFile(
        courseId: string,
        courseName: string, // Changed from _courseName to use it
        fileName: string,
        _fileUrl: string,
        basePath: string,
        _downloadedFiles: Record<string, any>,
        script?: string
    ): Promise<{ success: boolean; filePath?: string; message?: string }> {
        this.startBusy();
        try {
            return await this._downloadFileInternal(courseId, courseName, fileName, _fileUrl, basePath, _downloadedFiles, script);
        } finally {
            this.stopBusy();
        }
    }

    private async _downloadFileInternal(
        courseId: string,
        courseName: string,
        fileName: string,
        _fileUrl: string,
        basePath: string,
        _downloadedFiles: Record<string, any>,
        script?: string
    ): Promise<{ success: boolean; filePath?: string; message?: string }> {
        try {
            console.log(`SIGAA: Downloading file ${fileName}...`);
            if (!script) {
                return { success: false, message: 'Script not provided for download' };
            }

            // 0. Prepare Target Directory (Subdirectory per course)
            const safeCourseName = this.sanitizeFolderName(courseName);
            const targetDir = path.join(basePath, safeCourseName);

            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // 1. Enter course via Full Browser (Dashboard) - Headless API skips valid ViewState for files
            logger.info('SIGAA: Entering course via Full Browser for download (State reliability)...');
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            let parseResult: { success: boolean; files?: any[]; error?: string } = { success: false };

            if (entryResult.success && entryResult.html) {
                if (entryResult.cookies) {
                    this.httpScraper.setCookies(entryResult.cookies);
                }

                // 2. Navigate to Files Section (Essential for ViewState)
                logger.info('SIGAA: Navigating to Files Section for download state...');
                const filesNavResult = await this.playwrightLogin.navigateToFilesSection();

                if (filesNavResult.success && filesNavResult.html) {
                    logger.info('SIGAA: Files Section loaded. Parsing fresh scripts...');
                    parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, filesNavResult.html);
                } else {
                    logger.warn('SIGAA: Failed to navigate to files section. Proceeding with Dashboard HTML (likely to fail)...');
                    parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);
                }
            } else {
                return { success: false, message: entryResult.error || 'Failed to enter course' };
            }

            let targetScript = script;
            if (parseResult.success && parseResult.files) {
                const freshFile = parseResult.files.find(f => f.name === fileName);
                if (freshFile && freshFile.script) {
                    console.log(`SIGAA: Found fresh script for file ${fileName}`);
                    targetScript = freshFile.script;
                } else {
                    console.warn(`SIGAA: Could not find file ${fileName} in fresh page scan. Using original script.`);
                }
            }

            // 3. Use HTTP Scraper for fast download
            // Extract ID from script for logging if possible
            const idMatch = targetScript.match(/,id,([^,]+)/);
            const fileId = idMatch ? idMatch[1] : 'unknown';

            console.log(`SIGAA: Attempting fast HTTP download for file ${fileId}...`);
            const httpResult = await this.httpScraper.downloadFile(
                courseId,
                fileId,
                fileName,
                targetDir, // Use the new subdirectory
                targetScript
            );

            if (httpResult.success) {
                console.log('SIGAA: HTTP download successful!');
                return { success: true, filePath: httpResult.filePath };
            }

            console.warn('SIGAA: HTTP download failed. Refreshing session and retrying HTTP download...', httpResult.error);

            // 4. Refresh Session and Retry (HTTP Only)
            console.log(`SIGAA: Re-entering course ${courseId} to refresh session (Retry Attempt)...`);
            const retryEntryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!retryEntryResult.success || !retryEntryResult.html) {
                return { success: false, message: retryEntryResult.error || 'Failed to refresh session for retry' };
            }

            // Update HttpScraper with fresh state
            if (retryEntryResult.cookies) {
                this.httpScraper.setCookies(retryEntryResult.cookies);
            }
            // Parse again to get fresh script
            const retryParseResult = await this.httpScraper.getCourseFiles(courseId, courseName, retryEntryResult.html);

            let retryScript = script;
            if (retryParseResult.success && retryParseResult.files) {
                const freshFile = retryParseResult.files.find(f => f.name === fileName);
                if (freshFile && freshFile.script) {
                    retryScript = freshFile.script;
                }
            }

            // Retry HTTP Download
            console.log(`SIGAA: Retrying HTTP download for file ${fileName}...`);
            const retryHttpResult = await this.httpScraper.downloadFile(
                courseId,
                fileId,
                fileName,
                targetDir,
                retryScript
            );

            if (retryHttpResult.success) {
                console.log('SIGAA: HTTP retry successful!');
                return { success: true, filePath: retryHttpResult.filePath };
            } else {
                return { success: false, message: retryHttpResult.error || 'Download failed after retry' };
            }

        } catch (error: any) {
            console.error('SIGAA: Error downloading file:', error);
            return { success: false, message: error.message || 'Download failed' };
        }
    }

    async downloadAllFiles(
        courseId: string,
        courseName: string,
        files: Array<{ name: string; url: string; script?: string }>,
        basePath: string,
        _downloadedFiles: Record<string, any>,
        onProgress?: (fileName: string, status: 'downloaded' | 'skipped' | 'failed') => void
    ): Promise<{ success: boolean; downloaded?: number; skipped?: number; failed?: number; results?: any[]; message?: string }> {
        try {
            this.startBusy();
            logger.info(`SIGAA: =====================================`);
            logger.info(`SIGAA: downloadAllFiles called for course ${courseName}`);
            logger.info(`SIGAA: Files received: ${files.length}`);
            logger.info(`SIGAA: First 3 files: ${JSON.stringify(files.slice(0, 3).map(f => ({ name: f.name, hasScript: !!f.script, scriptLen: f.script?.length || 0 })))}`);
            logger.info(`SIGAA: basePath: ${basePath}`);

            // Create course subdirectory
            const safeCourseName = this.sanitizeFolderName(courseName || 'Unknown Course');
            const targetDir = path.join(basePath, safeCourseName);

            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const results: any[] = [];
            let downloaded = 0;
            let skipped = 0;
            let failed = 0;

            // Filter out duplicates first
            // Filter out duplicates first
            const queue = files.filter(file => {
                // Check if file exists in the TARGET directory
                const targetFilePath = path.join(targetDir, file.name);
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
                return {
                    success: false,
                    message: entryResult.error || 'Failed to enter course for download',
                    downloaded: 0,
                    skipped,
                    failed: queue.length,
                    results
                };
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
                return {
                    success: false,
                    message: parseResult.error || 'Failed to parse course for download',
                    downloaded: 0,
                    skipped,
                    failed: queue.length,
                    results
                };
            }

            logger.info(`SIGAA: Course session ready. Found ${parseResult.files?.length || 0} files on page.`);

            // Update queue with fresh scripts from the parsed page if available
            const freshFilesMap = new Map<string, string>();
            if (parseResult.files) {
                parseResult.files.forEach(f => {
                    if (f.name && f.script) {
                        freshFilesMap.set(f.name, f.script);
                    }
                });
            }

            logger.info(`SIGAA: Starting download loop for ${queue.length} files...`);
            for (const file of queue) {
                logger.info(`SIGAA: Processing file: ${file.name}`);

                // Use fresh script from parsed page if available, otherwise use original
                let targetScript = file.script;
                if (freshFilesMap.has(file.name)) {
                    targetScript = freshFilesMap.get(file.name)!;
                    logger.info(`SIGAA: Using fresh script for ${file.name}`);
                }

                if (!targetScript) {
                    logger.warn(`SIGAA: Skipping ${file.name} - no script available`);
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                    continue;
                }

                // Extract ID from script
                const idMatch = targetScript.match(/,id,([^,]+)/);
                const fileId = idMatch ? idMatch[1] : 'unknown';
                logger.info(`SIGAA: Downloading ${file.name} (ID: ${fileId})...`);

                const result = await this.httpScraper.downloadFile(
                    courseId,
                    fileId,
                    file.name,
                    targetDir, // Use the new subdirectory
                    targetScript
                );

                if (result.success) {
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

                    const retryFreshFilesMap = new Map<string, string>();
                    if (retryParseResult.success && retryParseResult.files) {
                        retryParseResult.files.forEach(f => {
                            if (f.name && f.script) {
                                retryFreshFilesMap.set(f.name, f.script);
                            }
                        });
                    }

                    const failedFiles = results
                        .filter(r => r.status === 'failed')
                        .map(r => files.find(f => f.name === r.fileName))
                        .filter(f => f !== undefined) as Array<{ name: string; url: string; script?: string }>;

                    for (const file of failedFiles) {
                        console.log(`SIGAA: Retrying HTTP download for ${file.name} (Attempt 1/3)...`);

                        let retryScript = file.script;
                        if (retryFreshFilesMap.has(file.name)) {
                            retryScript = retryFreshFilesMap.get(file.name)!;
                        }

                        if (!retryScript) continue;

                        const idMatch = retryScript.match(/,id,([^,]+)/);
                        const fileId = idMatch ? idMatch[1] : 'unknown';

                        // Retry Loop
                        let retrySuccess = false;
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            if (attempt > 1) console.log(`SIGAA: Retry attempt ${attempt}/3 for ${file.name}...`);

                            const retryResult = await this.httpScraper.downloadFile(
                                courseId,
                                fileId,
                                file.name,
                                targetDir,
                                retryScript || ''
                            );

                            if (retryResult.success) {
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
                                            const newFile = newParse.files?.find(f => f.name === file.name);
                                            if (newFile?.script) retryScript = newFile.script;
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

            return {
                success: true,
                downloaded,
                skipped,
                failed,
                results
            };
        } catch (error: any) {
            console.error('SIGAA: Error downloading files:', error);
            return { success: false, message: error.message || 'Download failed' };
        } finally {
            this.stopBusy();
        }
    }

    async getNewsDetail(courseId: string, courseName: string, newsId: string): Promise<{ success: boolean; news?: any; message?: string }> {
        this.startBusy();
        try {
            console.log(`SIGAA: Fetching news detail ${newsId} using Playwright...`);
            // Use Playwright for reliable JSF session handling
            const result = await this.playwrightLogin.getNewsDetail(courseId, courseName, newsId);

            if (!result.success) {
                return { success: false, message: result.error || 'Failed to fetch news detail' };
            }

            return { success: true, news: result.news };
        } catch (error: any) {
            console.error('SIGAA: Error fetching news detail:', error);
            return { success: false, message: error.message || 'Failed to fetch news detail' };
        } finally {
            this.stopBusy();
        }
    }

    async loadAllNews(courseId: string, courseName: string): Promise<{ success: boolean; news?: any[]; message?: string }> {
        this.startBusy();
        try {
            logger.info(`SIGAA: Loading all news for course ${courseName} (${courseId})...`);

            // 1. Enter Course to get fresh News List (and ViewState)
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName);
            if (!entryResult.success || !entryResult.html) {
                return { success: false, message: entryResult.error || 'Failed to enter course' };
            }

            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }

            // 2. Parse News Headers
            const parseResult = await this.httpScraper.getCourseFiles(courseId, 'Unknown', entryResult.html);
            const newsItems = parseResult.news || [];

            logger.info(`SIGAA: Found ${newsItems.length} news items. Fetching content for all...`);

            // 3. Fetch detail for each news item using Playwright (HTTP scraper fails due to session issues)
            const enrichedNews: any[] = [];
            for (const item of newsItems) {
                logger.info(`SIGAA: Fetching content for news "${item.title}"...`);

                // Use Playwright for reliable JSF session handling instead of HTTP scraper
                // The HTTP approach fails because sessions become stale between requests
                const detail = await this.playwrightLogin.getNewsDetail(courseId, courseName, item.id);

                if (detail.success && detail.news) {
                    enrichedNews.push({ ...item, content: detail.news.content });
                } else {
                    logger.warn(`SIGAA: Failed to fetch news "${item.title}": ${detail.error}`);
                    enrichedNews.push(item); // Keep header at least
                }
            }

            return { success: true, news: enrichedNews };

        } catch (error: any) {
            logger.error('SIGAA: Error loading all news:', error);
            return { success: false, message: error.message };
        } finally {
            this.stopBusy();
        }
    }
}
