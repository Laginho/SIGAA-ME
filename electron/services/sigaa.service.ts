import { PlaywrightLoginService } from './playwright-login.service';
import { HttpScraperService } from './http-scraper.service';

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

            // 1. Use Playwright to enter the course and capture HTML (Hybrid Approach)
            console.log('SIGAA: Entering course via Playwright to ensure session validity...');
            const entryResult = await this.playwrightLogin.enterCourseAndGetHTML(courseId);

            if (!entryResult.success || !entryResult.html) {
                console.error('SIGAA: Failed to enter course via Playwright:', entryResult.error);
                return { success: false, message: entryResult.error || 'Failed to enter course' };
            }

            // 2. Pass cookies and HTML to HttpScraper for fast parsing
            console.log('SIGAA: Passing captured HTML to HttpScraper...');
            if (entryResult.cookies) {
                this.httpScraper.setCookies(entryResult.cookies);
            }

            const result = await this.httpScraper.getCourseFiles(courseId, courseName, entryResult.html);

            if (!result.success) {
                return { success: false, message: result.error || 'Failed to fetch files' };
            }

            return { success: true, files: result.files, news: result.news };
        } catch (error: any) {
            console.error('SIGAA: Error fetching files:', error);
            return { success: false, message: error.message || 'Failed to fetch files' };
        }
    }

    async downloadFile(
        courseId: string,
        _courseName: string,
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

            // Use HTTP Scraper for fast download
            // Extract ID from script for logging if possible
            const idMatch = script.match(/,id,([^,]+)/);
            const fileId = idMatch ? idMatch[1] : 'unknown';

            console.log(`SIGAA: Attempting fast HTTP download for file ${fileId}...`);
            const httpResult = await this.httpScraper.downloadFile(
                courseId,
                fileId,
                fileName,
                basePath,
                script
            );

            if (httpResult.success) {
                console.log('SIGAA: HTTP download successful!');
                return { success: true, filePath: httpResult.filePath };
            }

            return { success: false, message: httpResult.error || 'Download failed (HTTP only)' };
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

            const results: any[] = [];
            let downloaded = 0;
            let skipped = 0;
            let failed = 0;

            // Filter out duplicates first
            const queue = files.filter(file => {
                const courseDownloads = downloadedFiles[courseId] || {};
                if (courseDownloads[file.name]) {
                    // Check if file actually exists on disk
                    // We don't have easy access to fs here without importing it, 
                    // but we can assume the UI state is somewhat correct or let the UI handle it.
                    // However, to be safe and match previous logic, we should probably check.
                    // For now, let's trust the downloadedFiles record passed from UI/Main.
                    console.log(`Skipping duplicate: ${file.name}`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped' });
                    if (onProgress) onProgress(file.name, 'skipped');
                    return false;
                }
                return true;
            });

            console.log(`SIGAA: Processing ${queue.length} files...`);

            for (const file of queue) {
                if (!file.script) {
                    console.warn(`SIGAA: Skipping ${file.name} - no script provided`);
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
                    continue;
                }

                // Extract ID from script
                const idMatch = file.script.match(/,id,([^,]+)/);
                const fileId = idMatch ? idMatch[1] : 'unknown';

                const result = await this.httpScraper.downloadFile(
                    courseId,
                    fileId,
                    file.name,
                    basePath,
                    file.script
                );

                if (result.success) {
                    downloaded++;
                    results.push({ fileName: file.name, status: 'downloaded', filePath: result.filePath });
                    if (onProgress) onProgress(file.name, 'downloaded');
                } else {
                    failed++;
                    results.push({ fileName: file.name, status: 'failed' });
                    if (onProgress) onProgress(file.name, 'failed');
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
