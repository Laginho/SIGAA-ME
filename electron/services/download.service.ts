import { Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export class DownloadService {
    private browser: Browser | null = null;

    constructor(browser: Browser | null) {
        this.browser = browser;
    }

    async downloadFile(
        page: Page,
        fileUrl: string,
        fileName: string,
        courseName: string,
        basePath: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            // Create course folder
            const courseFolder = path.join(basePath, this.sanitizeFolderName(courseName));
            if (!fs.existsSync(courseFolder)) {
                fs.mkdirSync(courseFolder, { recursive: true });
            }

            const filePath = path.join(courseFolder, this.sanitizeFileName(fileName));

            // Check if file already exists
            if (fs.existsSync(filePath)) {
                console.log(`File already exists: ${filePath}`);
                return { success: true, filePath }; // Consider existing file as success
            }

            // Set up download handler
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });

            // Trigger download by evaluating the onclick
            // The fileUrl might be a javascript function call
            if (fileUrl.startsWith('javascript:')) {
                await page.evaluate((url) => {
                    eval(url.replace('javascript:', ''));
                }, fileUrl);
            } else {
                // Direct URL - just navigate
                await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
            }

            // Wait for download to start
            const download = await downloadPromise;

            // Save to our chosen location
            await download.saveAs(filePath);

            console.log(`Downloaded: ${filePath}`);
            return { success: true, filePath };
        } catch (error: any) {
            console.error(`Download failed for ${fileName}:`, error);
            return { success: false, error: error.message };
        }
    }

    async downloadCourseFiles(
        page: Page,
        courseId: string,
        courseName: string,
        files: Array<{ name: string; url: string }>,
        basePath: string,
        downloadedFiles: Record<string, any>
    ): Promise<{
        downloaded: number;
        skipped: number;
        failed: number;
        results: Array<{ fileName: string; status: 'downloaded' | 'skipped' | 'failed'; filePath?: string }>;
    }> {
        const results: Array<{ fileName: string; status: 'downloaded' | 'skipped' | 'failed'; filePath?: string }> = [];
        let downloaded = 0;
        let skipped = 0;
        let failed = 0;

        for (const file of files) {
            // Check if already downloaded
            const courseDownloads = downloadedFiles[courseId] || {};
            if (courseDownloads[file.name]) {
                const existingPath = courseDownloads[file.name].path;
                if (fs.existsSync(existingPath)) {
                    console.log(`Skipping duplicate: ${file.name}`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped', filePath: existingPath });
                    continue;
                }
            }

            // Download file
            const result = await this.downloadFile(page, file.url, file.name, courseName, basePath);

            if (result.success) {
                downloaded++;
                results.push({ fileName: file.name, status: 'downloaded', filePath: result.filePath });
            } else {
                failed++;
                results.push({ fileName: file.name, status: 'failed' });
            }

            // Small delay between downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return { downloaded, skipped, failed, results };
    }

    private sanitizeFileName(fileName: string): string {
        // Remove invalid file name characters
        return fileName.replace(/[<>:"/\\|?*]/g, '_');
    }

    private sanitizeFolderName(folderName: string): string {
        // Remove invalid folder name characters and limit length
        return folderName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    }
}
