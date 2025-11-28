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
        courseName: string,
        fileName: string,
        fileUrl: string,
        basePath: string,
        downloadedFiles: Record<string, any>,
        script?: string
    ): Promise<{ success: boolean; filePath?: string; message?: string }> {
        try {
            console.log(`SIGAA: Downloading file ${fileName}...`);
            // Keep Playwright for downloads for now as HTTP download is not fully implemented
            const result = await this.playwrightLogin.downloadFile(
            courseId,
            courseName,
            fileName,
            fileUrl,
            basePath,
            downloadedFiles,
            script
        );

            if (!result.success) {
                return { success: false, message: result.error || 'Download failed' };
            }

            return { success: true, filePath: result.filePath };
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
            console.log(`SIGAA: Downloading all files for course ${courseName}...`);
            // Keep Playwright for downloads
            const result = await this.playwrightLogin.downloadAllFiles(
                courseId,
                courseName,
                files,
                basePath,
                downloadedFiles,
                onProgress
            );

            return {
                success: true,
                downloaded: result.downloaded,
                skipped: result.skipped,
                failed: result.failed,
                results: result.results
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
