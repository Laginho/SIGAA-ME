import { Browser, Page, Response } from 'playwright';
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
            const courseFolder = path.join(basePath, this.sanitizeFolderName(courseName));
            if (!fs.existsSync(courseFolder)) {
                fs.mkdirSync(courseFolder, { recursive: true });
            }

            const filePath = path.join(courseFolder, this.sanitizeFileName(fileName));

            if (fs.existsSync(filePath)) {
                console.log(`File already exists: ${filePath}`);
                return { success: true, filePath };
            }
            if (fs.existsSync(filePath + '.pdf')) {
                console.log(`File already exists: ${filePath}.pdf`);
                return { success: true, filePath: filePath + '.pdf' };
            }

            if (page.url() === 'about:blank') {
                throw new Error('Page lost context (about:blank)');
            }

            console.log(`Looking for file link with text: "${fileName}"`);
            const link = page.locator(`a:has-text("${fileName}")`).first();

            if (await link.isVisible()) {
                console.log(`Found link for ${fileName}, clicking...`);

                // NEW STRATEGY: Intercept and Force Download
                // We intercept the request, fetch it ourselves, and change the headers
                // to force the browser to download it as a file instead of displaying it.
                await page.route('**/*', async route => {
                    try {
                        const response = await route.fetch();
                        const headers = response.headers();
                        const contentType = headers['content-type'] || '';

                        if (contentType.includes('application/pdf')) {
                            console.log(`Intercepted PDF request: ${route.request().url()}`);
                            console.log('Forcing Content-Type to application/octet-stream');

                            headers['content-type'] = 'application/octet-stream';
                            headers['content-disposition'] = 'attachment';

                            await route.fulfill({
                                response,
                                headers
                            });
                        } else {
                            await route.continue();
                        }
                    } catch (e) {
                        // If fetch fails, try to continue normally
                        try { await route.continue(); } catch { }
                    }
                });

                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                // We still watch for popup because the click might open one, 
                // but it should immediately close or stay blank while download starts
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

                await link.click({ force: true });

                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                // Unroute to clean up
                await page.unroute('**/*');

                if (result.type === 'download') {
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded: ${filePath}`);
                    return { success: true, filePath };

                } else if (result.type === 'popup') {
                    const popup = result.data;
                    console.log(`Popup opened: ${popup.url()}`);

                    // If popup opened, it means the download might be happening in the popup context
                    // OR our interception didn't work for the popup's initial request.
                    // But wait! The popup's request IS the one we intercepted?
                    // If the popup opens, we should check if IT triggers a download.

                    try {
                        const popupDownload = await popup.waitForEvent('download', { timeout: 5000 });
                        await popupDownload.saveAs(filePath);
                        console.log(`Downloaded from popup: ${filePath}`);
                        await popup.close();
                        return { success: true, filePath };
                    } catch (e) {
                        console.log('No download event in popup yet...');
                    }

                    // If we are here, the popup opened and showed the content (interception failed?)
                    // OR the interception worked but the browser handled it weirdly.

                    // Let's try to apply the same interception to the popup!
                    // But it might be too late for the initial request.
                    // However, if we reload the popup, it might trigger it?

                    console.log('Reloading popup to force interception...');
                    await popup.route('**/*', async route => {
                        try {
                            const response = await route.fetch();
                            const headers = response.headers();
                            if (headers['content-type']?.includes('application/pdf')) {
                                console.log('Intercepted PDF in popup! Forcing download...');
                                headers['content-type'] = 'application/octet-stream';
                                headers['content-disposition'] = 'attachment';
                                await route.fulfill({ response, headers });
                            } else {
                                await route.continue();
                            }
                        } catch { try { await route.continue(); } catch { } }
                    });

                    try {
                        const reloadDownloadPromise = popup.waitForEvent('download', { timeout: 10000 });
                        await popup.reload();
                        const download = await reloadDownloadPromise;
                        await download.saveAs(filePath);
                        console.log(`Downloaded after popup reload: ${filePath}`);
                        await popup.close();
                        return { success: true, filePath };
                    } catch (e) {
                        console.log(`Reload strategy failed: ${e}`);
                    }

                    await popup.close();
                    return { success: false, error: 'Could not force download' };

                } else {
                    throw new Error('Timeout waiting for download or popup');
                }

            } else {
                // Fallback
                if (fileUrl.includes('javascript:')) {
                    const onclickPart = fileUrl.replace('javascript:', '');
                    const element = await page.$(`a[onclick*="${onclickPart}"]`);
                    if (element) {
                        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
                        await element.click();
                        const download = await downloadPromise;
                        await download.saveAs(filePath);
                        return { success: true, filePath };
                    }
                }
                await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
                return { success: true, filePath };
            }
        } catch (error: any) {
            console.error(`Download failed for ${fileName}:`, error);
            // Ensure unroute is called if we crash
            try { await page.unroute('**/*'); } catch { }
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
            const courseDownloads = downloadedFiles[courseId] || {};
            if (courseDownloads[file.name]) {
                const existingPath = courseDownloads[file.name].path;
                if (fs.existsSync(existingPath)) {
                    console.log(`Skipping duplicate: ${file.name}`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped', filePath: existingPath });
                    continue;
                }
                if (fs.existsSync(existingPath + '.pdf')) {
                    console.log(`Skipping duplicate: ${file.name}.pdf`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped', filePath: existingPath + '.pdf' });
                    continue;
                }
            }

            const result = await this.downloadFile(page, file.url, file.name, courseName, basePath);

            if (result.success) {
                downloaded++;
                results.push({ fileName: file.name, status: 'downloaded', filePath: result.filePath });
            } else {
                failed++;
                results.push({ fileName: file.name, status: 'failed' });
            }

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

    private isPdf(buffer: Buffer): boolean {
        if (buffer.length < 4) return false;
        return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    }
}
