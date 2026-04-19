import { Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';

export class DownloadService {
    constructor(_browser: Browser | null) {
        // browser is not used but kept for compatibility if needed
    }

    async downloadFile(
        page: Page,
        fileUrl: string,
        fileName: string,
        courseName: string,
        basePath: string,
        script?: string
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

            console.log(`Starting download for "${fileName}"`);
            console.log(`DownloadService: Script provided: ${!!script}`);
            if (script) console.log(`DownloadService: Script content (start): ${script.substring(0, 50)}...`);

            // Intercept the response to detect the REAL Content-Type from the server.
            // JSF redirectors often serve PDFs but the "suggestedFilename" from the browser
            // says ".html" because the redirect response header is text/html.
            let detectedContentType: string | null = null;
            await page.route('**/*', async (route) => {
                const response = await route.fetch();
                const ct = response.headers()['content-type'] || '';
                // Capture the type if it's a document, not a page resource
                if (ct && !ct.includes('text/html') && !ct.includes('javascript') && !ct.includes('css') && !ct.includes('image/')) {
                    detectedContentType = ct.split(';')[0].trim();
                }
                await route.fulfill({ response });
            });

            // Setup listeners
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

            // Trigger action
            if (script) {
                console.log('Executing JSF script to trigger download...');
                // We need to execute the script in the page context
                // The script is usually: if(typeof jsfcljs == 'function'){jsfcljs(...)}return false
                await page.evaluate((scriptStr: string) => {
                    const func = new Function(scriptStr.replace('return false', ''));
                    func();
                }, script);
            } else {
                console.log(`Looking for file link with text: "${fileName}"`);
                const link = page.locator(`a:has-text("${fileName}")`).first();
                if (await link.isVisible()) {
                    await link.click({ force: true });
                } else {
                    // Fallback to URL navigation if no link found and no script
                    if (fileUrl && !fileUrl.includes('javascript:')) {
                        await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
                        return { success: true, filePath };
                    }
                    throw new Error('Link not found and no script provided');
                }
            }

            // Handle result (Download or Popup)
            const result = await Promise.race([
                downloadPromise.then(d => ({ type: 'download', data: d })),
                popupPromise.then(p => ({ type: 'popup', data: p })),
                new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
            ]) as { type: string, data: any };

            if (result.type === 'download') {
                const download = result.data;
                let finalPath = filePath;

                // Priority: Content-Type from intercept > suggestedFilename from browser
                let ext = '';
                if (detectedContentType) {
                    const mimeExt = mime.extension(detectedContentType);
                    ext = mimeExt ? '.' + mimeExt : '';
                    console.log(`Extension from Content-Type (${detectedContentType}): '${ext}'`);
                }
                if (!ext) {
                    ext = path.extname(download.suggestedFilename());
                    console.log(`Extension from suggestedFilename: '${ext}'`);
                }
                if (ext && !path.extname(finalPath)) {
                    finalPath += ext;
                }

                await page.unroute('**/*');
                await download.saveAs(finalPath);
                console.log(`Downloaded: ${finalPath}`);
                return { success: true, filePath: finalPath };

            } else if (result.type === 'popup') {
                const popup = result.data;
                console.log(`Popup opened: ${popup.url()}`);

                try {
                    const popupDownload = await popup.waitForEvent('download', { timeout: 10000 });
                    let finalPath = filePath;
                    const suggestedFilename = popupDownload.suggestedFilename();
                    const ext = path.extname(suggestedFilename);
                    if (ext && !path.extname(finalPath)) {
                        finalPath += ext;
                    }

                    await popupDownload.saveAs(finalPath);
                    console.log(`Downloaded from popup: ${finalPath}`);
                    await popup.close();
                    return { success: true, filePath: finalPath };
                } catch (e) {
                    // Try to intercept if download event didn't fire
                    console.log('Popup download event timeout, trying interception...');
                }

                // Interception logic for popup
                await popup.route('**/*', async (route: any) => {
                    try {
                        const response = await route.fetch();
                        const headers = response.headers();
                        const contentType = headers['content-type'] || '';

                        // Force download for common document types
                        if (contentType.includes('application/pdf') ||
                            contentType.includes('application/msword') ||
                            contentType.includes('application/vnd.openxmlformats') ||
                            contentType.includes('application/zip')) {

                            console.log('Intercepted file in popup! Forcing download...');
                            headers['content-type'] = 'application/octet-stream';
                            headers['content-disposition'] = 'attachment';
                            await route.fulfill({ response, headers });
                        } else {
                            await route.continue();
                        }
                    } catch { try { await route.continue(); } catch { } }
                });

                try {
                    const reloadDownloadPromise = popup.waitForEvent('download', { timeout: 15000 });
                    await popup.reload();
                    const download = await reloadDownloadPromise;

                    let finalPath = filePath;
                    const suggestedFilename = download.suggestedFilename();
                    const ext = path.extname(suggestedFilename);
                    if (ext && !path.extname(finalPath)) {
                        finalPath += ext;
                    }

                    await download.saveAs(finalPath);
                    console.log(`Downloaded after popup reload: ${finalPath}`);
                    await popup.close();
                    return { success: true, filePath: finalPath };
                } catch (e) {
                    console.log(`Reload strategy failed: ${e}`);
                    await popup.close();
                    return { success: false, error: 'Could not force download from popup' };
                }

            } else {
                throw new Error('Timeout waiting for download or popup');
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
        files: Array<{ name: string; url: string; script?: string }>,
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
                if (fs.existsSync(existingPath)) {
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

                    const result = await this.downloadFile(workerPage, file.url, file.name, courseName, basePath, file.script);

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
}
