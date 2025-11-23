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

            // Check if file already exists (exact match)
            if (fs.existsSync(filePath)) {
                console.log(`File already exists: ${filePath}`);
                return { success: true, filePath };
            }
            // Check if file exists with .pdf extension
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
                        try { await route.continue(); } catch { }
                    }
                });

                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
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
                    let finalPath = filePath;
                    if (!finalPath.toLowerCase().endsWith('.pdf')) {
                        finalPath += '.pdf';
                    }
                    await download.saveAs(finalPath);
                    console.log(`Downloaded: ${finalPath}`);
                    return { success: true, filePath: finalPath };

                } else if (result.type === 'popup') {
                    const popup = result.data;
                    console.log(`Popup opened: ${popup.url()}`);

                    try {
                        const popupDownload = await popup.waitForEvent('download', { timeout: 5000 });
                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }
                        await popupDownload.saveAs(finalPath);
                        console.log(`Downloaded from popup: ${finalPath}`);
                        await popup.close();
                        return { success: true, filePath: finalPath };
                    } catch (e) {
                        // Continue to reload strategy
                    }

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

                        // Reload triggers the request again, which we intercept
                        // This might throw ERR_ABORTED because the navigation is cancelled by the download
                        await popup.reload().catch(e => {
                            if (e.message.includes('ERR_ABORTED') || e.message.includes('frame was detached')) {
                                console.log('Reload aborted as expected (download started)');
                            } else {
                                throw e;
                            }
                        });

                        const download = await reloadDownloadPromise;
                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }
                        await download.saveAs(finalPath);
                        console.log(`Downloaded after popup reload: ${finalPath}`);
                        await popup.close();
                        return { success: true, filePath: finalPath };
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
                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }
                        await download.saveAs(finalPath);
                        return { success: true, filePath: finalPath };
                    }
                }
                await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
                return { success: true, filePath };
            }
        } catch (error: any) {
            console.error(`Download failed for ${fileName}:`, error);
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
        downloadedFiles: Record<string, any>,
        onProgress?: (fileName: string, status: 'downloaded' | 'skipped' | 'failed') => void
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

        // Filter out duplicates first
        const queue = files.filter(file => {
            const courseDownloads = downloadedFiles[courseId] || {};
            if (courseDownloads[file.name]) {
                const existingPath = courseDownloads[file.name].path;
                if (fs.existsSync(existingPath) || fs.existsSync(existingPath + '.pdf')) {
                    console.log(`Skipping duplicate: ${file.name}`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped', filePath: existingPath });
                    if (onProgress) onProgress(file.name, 'skipped');
                    return false;
                }
            }
            return true;
        });

        console.log(`Starting parallel download for ${queue.length} files with 3 workers...`);

        const courseUrl = page.url();
        const CONCURRENCY = 3;

        const processQueue = async (workerId: number) => {
            // Worker 0 uses the main page, others create new pages
            let workerPage = workerId === 0 ? page : await page.context().newPage();

            try {
                // If new page, navigate to course
                if (workerId !== 0) {
                    console.log(`[Worker ${workerId}] Navigating to course...`);
                    await workerPage.goto(courseUrl, { waitUntil: 'domcontentloaded' });
                }

                while (queue.length > 0) {
                    const file = queue.shift();
                    if (!file) break;

                    console.log(`[Worker ${workerId}] Processing ${file.name}...`);

                    // Ensure we are on the right page
                    if (workerPage.url() !== courseUrl) {
                        await workerPage.goto(courseUrl, { waitUntil: 'domcontentloaded' });
                    }

                    const result = await this.downloadFile(workerPage, file.url, file.name, courseName, basePath);

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
            } catch (e) {
                console.error(`[Worker ${workerId}] Error:`, e);
            } finally {
                // Close extra pages
                if (workerId !== 0) {
                    await workerPage.close();
                }
            }
        };

        const workers = [];
        // Spawn workers (up to CONCURRENCY, but not more than queue length)
        const numWorkers = Math.min(CONCURRENCY, Math.max(1, queue.length));

        for (let i = 0; i < numWorkers; i++) {
            workers.push(processQueue(i));
        }

        await Promise.all(workers);

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
