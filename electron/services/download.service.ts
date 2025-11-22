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
                return { success: true, filePath };
            }

            // Ensure we are on the page (sometimes downloads trigger reload)
            if (page.url() === 'about:blank') {
                throw new Error('Page lost context (about:blank)');
            }

            console.log(`Looking for file link with text: "${fileName}"`);

            // Try to find the link by text content
            const link = page.getByText(fileName, { exact: false }).first();

            if (await link.isVisible()) {
                console.log(`Found link for ${fileName}, clicking...`);

                // Race between download and popup (some files open in new tab)
                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

                await link.click();

                // Wait for either download or popup
                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                if (result.type === 'download') {
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded: ${filePath}`);
                    return { success: true, filePath };
                } else if (result.type === 'popup') {
                    const popup = result.data;
                    await popup.waitForLoadState();
                    const popupUrl = popup.url();
                    console.log(`File opened in popup: ${popupUrl}`);

                    // If it's a PDF or file, we might be able to download it via HTTP
                    // or print to PDF if it's a viewer
                    if (popupUrl.endsWith('.pdf') || popupUrl.includes('visualizar')) {
                        // Try to download the URL directly using the cookies from the main page
                        const context = page.context();
                        const response = await context.request.get(popupUrl);
                        const buffer = await response.body();
                        fs.writeFileSync(filePath, buffer);
                        await popup.close();
                        console.log(`Saved popup content to: ${filePath}`);
                        return { success: true, filePath };
                    }

                    await popup.close();
                    return { success: false, error: 'Opened in popup but could not save' };
                } else {
                    throw new Error('Timeout waiting for download or popup');
                }

            } else {
                // Fallback: try to find by href/onclick if available
                console.log('Link not found by text, trying URL match...');
                if (fileUrl.includes('javascript:')) {
                    const onclickPart = fileUrl.replace('javascript:', '');
                    const element = await page.$(`a[onclick*="${onclickPart}"]`);
                    if (element) {
                        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
                        await element.click();
                        const download = await downloadPromise;
                        await download.saveAs(filePath);
                        return { success: true, filePath };
                    } else {
                        throw new Error(`Could not find link for file: ${fileName}`);
                    }
                } else {
                    // Direct URL navigation
                    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
                    return { success: true, filePath };
                }
            }
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
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return { downloaded, skipped, failed, results };
    }

    private sanitizeFileName(fileName: string): string {
        return fileName.replace(/[<>:"/\\|?*]/g, '_');
    }

    private sanitizeFolderName(folderName: string): string {
        return folderName.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
    }
}
