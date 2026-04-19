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

            let existingFileToUse = '';

            const checkAndClearCorruptFile = (p: string) => {
                if (fs.existsSync(p)) {
                    try {
                        const stats = fs.statSync(p);
                        if (stats.size < 50000) {
                            const content = fs.readFileSync(p, 'utf8');
                            if (content.toLowerCase().includes('<!doctype html>') || content.toLowerCase().includes('<html') || content.toLowerCase().includes('<script') || content.toLowerCase().includes('sigaa')) {
                                console.log(`Discovered corrupted 1 KB HTML cache file at ${p}. Deleting and forcing fresh download.`);
                                fs.unlinkSync(p);
                                return false;
                            }
                        }
                    } catch (e) {
                        console.error(`Error inspecting existing file at ${p}:`, e);
                    }
                    return true;
                }
                return false;
            };

            if (checkAndClearCorruptFile(filePath)) existingFileToUse = filePath;
            else if (checkAndClearCorruptFile(filePath + '.pdf')) existingFileToUse = filePath + '.pdf';

            if (existingFileToUse) {
                console.log(`Valid file already exists: ${existingFileToUse}`);
                return { success: true, filePath: existingFileToUse };
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
            console.log(`Looking for fresh download script for: "${fileName}"`);
            
            const freshAction = await page.evaluate((fname) => {
                const rows = Array.from(document.querySelectorAll('.item,.item-impar,.item-par, .form-baixar-arquivo'));
                for (const row of rows) {
                    const link = row.tagName.toLowerCase() === 'a' ? row : row.querySelector('.form-baixar-arquivo, a[href]');
                    if (!link) continue;
                    
                    const desc = link.querySelector('.descricao-form-disciplina') || link;
                    let text = (desc.textContent || '').trim().replace(/[\n\r]/g, '').trim();
                    
                    if (text === fname || text.includes(fname) || fname.includes(text)) {
                        const onclick = link.getAttribute('onclick');
                        if (onclick) return { type: 'script', value: onclick };
                        
                        const href = link.getAttribute('href');
                        if (href) return { type: 'href', value: href };
                    }
                }
                return null;
            }, fileName);

            if (freshAction) {
                if (freshAction.type === 'script') {
                    console.log('Executing completely fresh JSF script from current DOM...');
                    await page.evaluate((scriptStr: string) => {
                        const func = new Function(scriptStr.replace('return false', ''));
                        func();
                    }, freshAction.value);
                } else if (freshAction.type === 'href') {
                    console.log('Navigating to direct URL from current DOM...');
                    await page.goto(freshAction.value, { waitUntil: 'networkidle', timeout: 30000 });
                }
            } else {
                console.log('Failed to find fresh action. Fallback to cached original script...');
                if (script) {
                    await page.evaluate((scriptStr: string) => {
                        const func = new Function(scriptStr.replace('return false', ''));
                        func();
                    }, script);
                } else if (fileUrl && !fileUrl.includes('javascript:')) {
                    await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 30000 });
                } else {
                    throw new Error('Link not found and no script provided in fallback');
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
                }

                if (!ext) {
                    ext = path.extname(download.suggestedFilename());
                }

                // JSF redirects often cause the browser to suggest .html. Since most materials
                // without explicit extensions are PDFs, we safely force .pdf in these cases.
                if (ext === '.html' || ext === '.htm') {
                    ext = '.pdf';
                }

                let downloadedExt = ext && !path.extname(finalPath) ? ext : '';
                if (downloadedExt) {
                    finalPath += downloadedExt;
                }

                await page.unroute('**/*');
                await download.saveAs(finalPath);

                // --- JSF Error Page Detection ---
                try {
                    let successRead = false;
                    for (let i = 0; i < 5; i++) {
                        try {
                            const stats = fs.statSync(finalPath);
                            if (stats.size < 50000) {
                                const content = fs.readFileSync(finalPath, 'utf8');
                                if (content.toLowerCase().includes('<!doctype html>') || content.toLowerCase().includes('<html') || content.toLowerCase().includes('<script') || content.toLowerCase().includes('sigaa')) {
                                    for (let j = 0; j < 5; j++) {
                                        try { fs.unlinkSync(finalPath); break; } catch { await new Promise(r => setTimeout(r, 100)); }
                                    }
                                    if (content.includes('ViewExpiredException') || content.includes('Expira') || content.toLowerCase().includes('expira')) {
                                        throw new Error('JSF_SESSION_EXPIRED');
                                    } else {
                                        throw new Error('O servidor retornou uma página html ao invés do arquivo. Possível erro no SIGAA.');
                                    }
                                }
                            }
                            break; // Not a small file, or check passed
                        } catch (e: any) {
                            if (e.message === 'JSF_SESSION_EXPIRED' || e.message.includes('servidor retornou')) throw e;
                            console.error(`Error reading file for validation (attempt ${i + 1}/5):`, e.message);
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                    if (!successRead) {
                        console.warn('Could not validate downloaded file due to lock errors. Assuming success but file might be corrupt.');
                    }
                } catch (e: any) {
                    if (e.message === 'JSF_SESSION_EXPIRED' || e.message.includes('servidor retornou')) {
                        throw e; // Bubble up
                    }
                }

                console.log(`Downloaded: ${finalPath}`);
                return { success: true, filePath: finalPath };

            } else if (result.type === 'popup') {
                const popup = result.data;
                console.log(`Popup opened: ${popup.url()}`);

                try {
                    const popupDownload = await popup.waitForEvent('download', { timeout: 10000 });
                    let finalPath = filePath;
                    const suggestedFilename = popupDownload.suggestedFilename();
                    let ext = path.extname(suggestedFilename);

                    if (ext === '.html' || ext === '.htm') {
                        ext = '.pdf';
                    }

                    if (ext && !path.extname(finalPath)) {
                        finalPath += ext;
                    }

                    await popupDownload.saveAs(finalPath);

                    let successReadPopup = false;
                    for (let i = 0; i < 5; i++) {
                        try {
                            const stats = fs.statSync(finalPath);
                            if (stats.size < 50000) {
                                const content = fs.readFileSync(finalPath, 'utf8');
                                if (content.toLowerCase().includes('<!doctype html>') || content.toLowerCase().includes('<html') || content.toLowerCase().includes('<script') || content.toLowerCase().includes('sigaa')) {
                                    for (let j = 0; j < 5; j++) {
                                        try { fs.unlinkSync(finalPath); break; } catch { await new Promise(r => setTimeout(r, 100)); }
                                    }
                                    if (content.includes('ViewExpiredException') || content.includes('Expira') || content.toLowerCase().includes('expira')) {
                                        throw new Error('JSF_SESSION_EXPIRED');
                                    } else {
                                        throw new Error('O servidor retornou uma página html ao invés do arquivo. Possível erro no SIGAA.');
                                    }
                                }
                            }
                            break;
                        } catch (e: any) {
                            if (e.message === 'JSF_SESSION_EXPIRED' || e.message.includes('servidor retornou')) {
                                await popup.close();
                                throw e;
                            }
                            console.error(`Popup error reading file for validation (attempt ${i + 1}/5):`, e.message);
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                    if (!successReadPopup) {
                        console.warn('Could not validate popup file due to lock errors.');
                    }

                    console.log(`Downloaded from popup: ${finalPath}`);
                    await popup.close();
                    return { success: true, filePath: finalPath };
                } catch (e: any) {
                    if (e.message === 'JSF_SESSION_EXPIRED' || e.message.includes('servidor retornou')) {
                        throw e; // BUBBLE IT UP! IT'S NOT A TIMEOUT!
                    }
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
                    let ext = path.extname(suggestedFilename);

                    if (ext === '.html' || ext === '.htm') {
                        ext = '.pdf';
                    }

                    if (ext && !path.extname(finalPath)) {
                        finalPath += ext;
                    }

                    await download.saveAs(finalPath);

                    let successReadReload = false;
                    for (let i = 0; i < 5; i++) {
                        try {
                            const stats = fs.statSync(finalPath);
                            if (stats.size < 50000) {
                                const content = fs.readFileSync(finalPath, 'utf8');
                                if (content.toLowerCase().includes('<!doctype html>') || content.toLowerCase().includes('<html') || content.toLowerCase().includes('<script') || content.toLowerCase().includes('sigaa')) {
                                    for (let j = 0; j < 5; j++) {
                                        try { fs.unlinkSync(finalPath); break; } catch { await new Promise(r => setTimeout(r, 100)); }
                                    }
                                    if (content.includes('ViewExpiredException') || content.includes('Expira') || content.toLowerCase().includes('expira')) {
                                        throw new Error('JSF_SESSION_EXPIRED');
                                    } else {
                                        throw new Error('O servidor retornou uma página html ao invés do arquivo. Possível erro no SIGAA.');
                                    }
                                }
                            }
                            break;
                        } catch (e: any) {
                            if (e.message === 'JSF_SESSION_EXPIRED' || e.message.includes('servidor retornou')) {
                                await popup.close();
                                throw e;
                            }
                            console.error(`Popup reload error reading file for validation (attempt ${i + 1}/5):`, e.message);
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                    if (!successReadReload) {
                        console.warn('Could not validate popup reload file due to lock errors.');
                    }

                    console.log(`Downloaded after popup reload: ${finalPath}`);
                    await popup.close();
                    return { success: true, filePath: finalPath };
                } catch (e: any) {
                    if (e.message === 'JSF_SESSION_EXPIRED' || e.message.includes('servidor retornou')) {
                        throw e; // BUBBLE IT UP!
                    }
                    console.log(`Reload strategy failed: ${e}`);
                    await popup.close();
                    return { success: false, error: 'Could not force download from popup' };
                }

            } else {
                throw new Error('Timeout waiting for download or popup');
            }

        } catch (error: any) {
            console.error(`Download failed for ${fileName}:`, error);
            if (error.message === 'JSF_SESSION_EXPIRED') {
                throw error;
            }
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
        let globalError: string | null = null;

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

                    if (globalError) {
                        console.log(`[Worker ${workerId}] Aborting nicely due to global error.`);
                        break;
                    }

                    console.log(`[Worker ${workerId}] Processing ${file.name}...`);

                    // Ensure we are on the right page
                    if (workerPage.url() !== courseUrl) {
                        await workerPage.goto(courseUrl, { waitUntil: 'domcontentloaded' });
                    }

                    try {
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
                    } catch (e: any) {
                        if (e.message === 'JSF_SESSION_EXPIRED') {
                            globalError = 'JSF_SESSION_EXPIRED';
                            // Put file back in queue so it can be retried by the upper layer if needed
                            queue.unshift(file);
                            console.log(`[Worker ${workerId}] Detected session expiration! Aborting queue.`);
                            break;
                        } else {
                            failed++;
                            results.push({ fileName: file.name, status: 'failed' });
                            if (onProgress) onProgress(file.name, 'failed');
                        }
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

        if (globalError === 'JSF_SESSION_EXPIRED') {
            throw new Error('JSF_SESSION_EXPIRED');
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
