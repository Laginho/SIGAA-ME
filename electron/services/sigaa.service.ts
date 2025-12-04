import { PlaywrightLoginService } from './playwright-login.service';
import { HttpScraperService } from './http-scraper.service';
import * as fs from 'fs';
import * as path from 'path';

// This class will handle all the logic for talking to SIGAA using Playwright and HTTP.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private playwrightLogin: PlaywrightLoginService;
    private httpScraper: HttpScraperService;

    constructor() {
        // Initialize services
        this.playwrightLogin = new PlaywrightLoginService();
        this.httpScraper = new HttpScraperService();

        console.log('SIGAA: Service initialized with Playwright and HttpScraper');
    }

    async login(username: string, password: string): Promise<{ success: boolean; message?: string; account?: { name: string; photoUrl?: string } }> {
        try {
            // Use Playwright to login and get user data
            console.log('SIGAA: Starting Playwright login...');
            const result = await this.playwrightLogin.login(username, password);

            if (!result.success) {
                return { success: false, message: result.error || 'Login failed' };
            }

            console.log('SIGAA: Login successful!');

            // Pass cookies to HttpScraper
            if (result.cookies) {
                this.httpScraper.setCookies(result.cookies);
            }

            // Return the user data extracted by Playwright
            return {
                success: true,
                account: {
                    name: result.userName || 'User',
                    photoUrl: undefined // We can extract this later if needed
                }
            };
        } catch (error: any) {
            console.error('Login error:', error);
            return { success: false, message: error.message || 'Unknown error occurred.' };
        }
    }

    async getCourses(): Promise<{ success: boolean; courses?: any[]; message?: string }> {
        try {
            console.log('SIGAA: Fetching courses using Playwright...');

            // Use Playwright to scrape courses from the page (keep this for now as it's the entry point)
            const result = await this.playwrightLogin.getCourses();

            if (!result.success) {
                return { success: false, message: result.error || 'Failed to fetch courses' };
            }

            console.log('SIGAA: Found courses:', result.courses?.length || 0);

            return {
                success: true,
                courses: result.courses
            };
        } catch (error: any) {
            console.error('SIGAA: Error fetching courses:', error);
            return { success: false, message: error.message || 'Failed to fetch courses' };
        }
    }

    async getCourseFiles(courseId: string, courseName?: string): Promise<{ success: boolean; files?: any[]; news?: any[]; message?: string }> {
        try {
            console.log(`SIGAA: Fetching files for course ${courseName || courseId}...`);

            // 1. Try Fast HTTP Entry first
            console.log('SIGAA: Attempting Fast HTTP Entry...');

            // Ensure we have cookies from login
            const cookies = await this.playwrightLogin.getCookies();
            this.httpScraper.setCookies(cookies);

            const httpEntry = await this.httpScraper.enterCourseHTTP(courseId);

            let html = '';
            if (httpEntry.success && httpEntry.html) {
                console.log('SIGAA: Fast HTTP Entry successful!');
                html = httpEntry.html;
            } else {
                console.error('SIGAA: Fast HTTP Entry failed:', httpEntry.error);
                return { success: false, message: `HTTP Entry failed: ${httpEntry.error}` };

                // Fallback DISABLED for testing
                /*
                console.warn('SIGAA: Fast HTTP Entry failed, falling back to Playwright:', httpEntry.error);
                
                // Fallback to Playwright
                const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');
                if (!entryResult.success || !entryResult.html) {
                    console.error('SIGAA: Failed to enter course via Playwright:', entryResult.error);
                    return { success: false, message: entryResult.error || 'Failed to enter course' };
                }
                html = entryResult.html;
                if (entryResult.cookies) {
                    this.httpScraper.setCookies(entryResult.cookies);
                }
                */
            }

            // 2. Parse files
            console.log('SIGAA: Parsing course files...');
            const result = await this.httpScraper.getCourseFiles(courseId, courseName, html);

            if (!result.success) {
                return { success: false, message: result.error || 'Failed to fetch files' };
            }

            return { success: true, files: result.files, news: result.news };
        } catch (error: any) {
            console.error('SIGAA: Error fetching files:', error);
            return { success: false, message: error.message || 'Failed to fetch files' };
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
        try {
            console.log(`SIGAA: Downloading file ${fileName}...`);
            if (!script) {
                return { success: false, message: 'Script not provided for download' };
            }

            // Create course subdirectory
            const safeCourseName = this.sanitizeFolderName(courseName || 'Unknown Course');
            const targetDir = path.join(basePath, safeCourseName);

            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            // 1. Re-enter course to ensure fresh ViewState (Critical for avoiding 1KB error pages)
            console.log(`SIGAA: Re-entering course ${courseId} to refresh session before download...`);
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!entryResult.success || !entryResult.html) {
                return { success: false, message: entryResult.error || 'Failed to enter course for download' };
            }

            // 2. Update HttpScraper with fresh state
            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }
            // We must parse the new HTML to update the ViewState in HttpScraper
            const parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);

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
        downloadedFiles: Record<string, any>,
        onProgress?: (fileName: string, status: 'downloaded' | 'skipped' | 'failed') => void
    ): Promise<{ success: boolean; downloaded?: number; skipped?: number; failed?: number; results?: any[]; message?: string }> {
        try {
            console.log(`SIGAA: Downloading all files for course ${courseName} (HTTP only)...`);

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

            console.log(`SIGAA: Processing ${queue.length} files...`);

            // 1. Re-enter course ONCE before the batch to ensure fresh ViewState
            console.log(`SIGAA: Re-entering course ${courseId} to refresh session before batch download...`);
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId, courseName || 'Unknown Course');

            if (!entryResult.success || !entryResult.html) {
                return { success: false, message: entryResult.error || 'Failed to enter course for batch download' };
            }

            // 2. Update HttpScraper with fresh state
            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }
            // We must parse the new HTML to update the ViewState in HttpScraper
            const parseResult = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);

            const freshFilesMap = new Map<string, string>();
            if (parseResult.success && parseResult.files) {
                parseResult.files.forEach(f => {
                    if (f.name && f.script) {
                        freshFilesMap.set(f.name, f.script);
                    }
                });
                console.log(`SIGAA: Mapped ${freshFilesMap.size} fresh file scripts.`);
            }

            for (const file of queue) {
                if (!file.script) {
                    console.warn(`SIGAA: Skipping ${file.name} - no script provided`);
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                    continue;
                }

                let targetScript = file.script;
                if (freshFilesMap.has(file.name)) {
                    targetScript = freshFilesMap.get(file.name)!;
                } else {
                    console.warn(`SIGAA: Using original script for ${file.name} (not found in fresh scan)`);
                }

                // Extract ID from script
                const idMatch = targetScript.match(/,id,([^,]+)/);
                const fileId = idMatch ? idMatch[1] : 'unknown';

                const result = await this.httpScraper.downloadFile(
                    courseId,
                    fileId,
                    file.name,
                    targetDir, // Use the new subdirectory
                    targetScript
                );

                if (result.success) {
                    downloaded++;
                    results.push({ fileName: file.name, status: 'downloaded', filePath: result.filePath });
                    if (onProgress) onProgress(file.name, 'downloaded');
                } else {
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                }
            }

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
                        console.log(`SIGAA: Retrying HTTP download for ${file.name}...`);

                        let retryScript = file.script;
                        if (retryFreshFilesMap.has(file.name)) {
                            retryScript = retryFreshFilesMap.get(file.name)!;
                        }

                        if (!retryScript) continue;

                        const idMatch = retryScript.match(/,id,([^,]+)/);
                        const fileId = idMatch ? idMatch[1] : 'unknown';

                        const retryResult = await this.httpScraper.downloadFile(
                            courseId,
                            fileId,
                            file.name,
                            targetDir,
                            retryScript
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
                        } else {
                            console.error(`SIGAA: Retry failed for ${file.name}: ${retryResult.error}`);
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
        }
    }

    async getNewsDetail(courseId: string, newsId: string): Promise<{ success: boolean; news?: any; message?: string }> {
        try {
            console.log(`SIGAA: Fetching news detail ${newsId} using HTTP Scraper...`);
            // Use HTTP Scraper for speed
            const freshCookies = await this.playwrightLogin.getCookies();
            this.httpScraper.setCookies(freshCookies);
            const result = await this.httpScraper.getNewsDetail(courseId, newsId);

            if (!result.success) {
                return { success: false, message: result.error || 'Failed to fetch news detail' };
            }

            return { success: true, news: result.news };
        } catch (error: any) {
            console.error('SIGAA: Error fetching news detail:', error);
            return { success: false, message: error.message || 'Failed to fetch news detail' };
        }
    }
}
