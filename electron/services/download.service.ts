// DOC-003: este arquivo não tem `import ... from` estático em lugar nenhum.
// Ele é carregado por `await import('./download.service')` em
// `playwright-login.service.ts` (`PlaywrightLoginService.downloadFile` e
// `downloadAllFiles`). Cadeia real até um ponto de entrada:
//   IPC `download-file` (main.ts) → SigaaService.downloadFile
//   → SigaaService.downloadViaPlaywright (plano B, BUG-004) → PlaywrightLoginService.downloadFile → aqui
// `PlaywrightLoginService.downloadAllFiles` também importa este arquivo, mas hoje
// não tem chamador (ver o `ponytail:` em SigaaService.downloadAllFiles).
// Busca por `import ... from` vai dizer que é código morto. Não é.
import { Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.service';
import { resolveDownloadTarget, ensureDirInsideRoot } from './download-path';
import { finalizeDownload, validateHead, MAX_DOWNLOAD_BYTES } from './file-validation.service';

const log = logger.scope('Download');

const CHECK_HEAD_SIZE = 4096;

/** Primeiros bytes de um arquivo já existente no disco — o bastante para `validateHead`. */
function readHeadSync(filePath: string): Buffer {
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(CHECK_HEAD_SIZE);
        const bytesRead = fs.readSync(fd, buffer, 0, CHECK_HEAD_SIZE, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        fs.closeSync(fd);
    }
}

/**
 * O Playwright entrega o `.part` inteiro via `download.saveAs()` — sem
 * chance de abortar o stream no meio, como o caminho HTTP faz. O teto só
 * pode ser vigiado depois de gravado.
 */
async function rejectIfTooLarge(partPath: string): Promise<string | undefined> {
    const stats = await fs.promises.stat(partPath);
    if (stats.size <= MAX_DOWNLOAD_BYTES) return undefined;
    await fs.promises.unlink(partPath).catch(() => { });
    return `Arquivo (${stats.size} bytes) excede o limite de ${MAX_DOWNLOAD_BYTES} bytes`;
}

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
            const { dir: courseFolder, fullPath: filePath } = resolveDownloadTarget(basePath, courseName, fileName);
            ensureDirInsideRoot(basePath, courseFolder);
            // Nome já sanitizado por `resolveDownloadTarget`; reaproveitado como
            // base para o `.part` e para `finalizeDownload`.
            const safeFileName = path.basename(filePath);

            let existingFileToUse = '';

            // DL-002: decide por conteúdo (mesma validação do download), não
            // por `includes('sigaa')` — isso apagava avisos legítimos que
            // citavam o portal e via, ao rodar sobre o arquivo já existente
            // ANTES de baixar, arquivo do usuário sem relação com o download.
            const checkAndClearCorruptFile = (p: string) => {
                if (!fs.existsSync(p)) return false;
                try {
                    const head = readHeadSync(p);
                    const ext = path.extname(p).toLowerCase();
                    const check = validateHead(head, ext);
                    if (!check.ok) {
                        log.info(`Discovered invalid cached file (${check.reason}). Deleting and forcing fresh download.`, { path: p });
                        fs.unlinkSync(p);
                        return false;
                    }
                } catch (e) {
                    // Não deu para ler: não dá para afirmar que é válido. Força
                    // download novo em vez de devolver um caminho ilegível (DL-005).
                    log.error('Error inspecting existing file, forcing fresh download.', { path: p, error: e });
                    return false;
                }
                return true;
            };

            if (checkAndClearCorruptFile(filePath)) existingFileToUse = filePath;

            if (existingFileToUse) {
                log.info('Valid file already exists.', { path: existingFileToUse });
                return { success: true, filePath: existingFileToUse };
            }

            if (page.url() === 'about:blank') {
                throw new Error('Page lost context (about:blank)');
            }

            log.info('Starting download.', { fileName });
            log.info(`Script provided: ${!!script}.`);
            if (script) log.info('Script content (start).', { script: script.substring(0, 50) });

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
            log.info('Looking for fresh download script.', { fileName });

            const freshAction = await page.evaluate((fname) => {
                const rows = Array.from(document.querySelectorAll('.item,.item-impar,.item-par, .form-baixar-arquivo'));
                for (const row of rows) {
                    const link = row.tagName.toLowerCase() === 'a' ? row : row.querySelector('.form-baixar-arquivo, a[href]');
                    if (!link) continue;

                    const desc = link.querySelector('.descricao-form-disciplina') || link;
                    const text = (desc.textContent || '').trim().replace(/[\n\r]/g, '').trim();

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
                    log.info('Executing completely fresh JSF script from current DOM.');
                    await page.evaluate((scriptStr: string) => {
                        const func = new Function(scriptStr.replace('return false', ''));
                        func();
                    }, freshAction.value);
                } else if (freshAction.type === 'href') {
                    log.info('Navigating to direct URL from current DOM.');
                    await page.goto(freshAction.value, { waitUntil: 'networkidle', timeout: 30000 });
                }
            } else {
                log.info('Failed to find fresh action. Fallback to cached original script.');
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

                await page.unroute('**/*');
                await download.saveAs(filePath + '.part');

                const tooLargeError = await rejectIfTooLarge(filePath + '.part');
                if (tooLargeError) return { success: false, error: tooLargeError };

                const outcome = await finalizeDownload({
                    partPath: filePath + '.part',
                    dir: courseFolder,
                    fileName: safeFileName,
                    hintFileName: download.suggestedFilename(),
                    contentType: detectedContentType ?? undefined
                });

                if (!outcome.ok) {
                    if (outcome.reason === 'session-expired') throw new Error('JSF_SESSION_EXPIRED');
                    return { success: false, error: outcome.error };
                }

                log.info('Downloaded.', { filePath: outcome.filePath });
                return { success: true, filePath: outcome.filePath };

            } else if (result.type === 'popup') {
                const popup = result.data;
                log.info('Popup opened.', { url: popup.url() });

                try {
                    const popupDownload = await popup.waitForEvent('download', { timeout: 10000 });
                    await popupDownload.saveAs(filePath + '.part');

                    const tooLargePopupError = await rejectIfTooLarge(filePath + '.part');
                    if (tooLargePopupError) {
                        await popup.close();
                        return { success: false, error: tooLargePopupError };
                    }

                    const outcome = await finalizeDownload({
                        partPath: filePath + '.part',
                        dir: courseFolder,
                        fileName: safeFileName,
                        hintFileName: popupDownload.suggestedFilename()
                    });

                    if (!outcome.ok) {
                        await popup.close();
                        if (outcome.reason === 'session-expired') throw new Error('JSF_SESSION_EXPIRED');
                        return { success: false, error: outcome.error };
                    }

                    log.info('Downloaded from popup.', { filePath: outcome.filePath });
                    await popup.close();
                    return { success: true, filePath: outcome.filePath };
                } catch (e: any) {
                    if (e.message === 'JSF_SESSION_EXPIRED') {
                        throw e; // BUBBLE IT UP! IT'S NOT A TIMEOUT!
                    }
                    // Try to intercept if download event didn't fire
                    log.info('Popup download event timeout, trying interception.');
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

                            log.info('Intercepted file in popup. Forcing download.');
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

                    await download.saveAs(filePath + '.part');

                    const tooLargeReloadError = await rejectIfTooLarge(filePath + '.part');
                    if (tooLargeReloadError) {
                        await popup.close();
                        return { success: false, error: tooLargeReloadError };
                    }

                    const outcome = await finalizeDownload({
                        partPath: filePath + '.part',
                        dir: courseFolder,
                        fileName: safeFileName,
                        hintFileName: download.suggestedFilename()
                    });

                    if (!outcome.ok) {
                        await popup.close();
                        if (outcome.reason === 'session-expired') throw new Error('JSF_SESSION_EXPIRED');
                        return { success: false, error: outcome.error };
                    }

                    log.info('Downloaded after popup reload.', { filePath: outcome.filePath });
                    await popup.close();
                    return { success: true, filePath: outcome.filePath };
                } catch (e: any) {
                    if (e.message === 'JSF_SESSION_EXPIRED') {
                        throw e; // BUBBLE IT UP!
                    }
                    log.warn('Reload strategy failed.', { error: e });
                    await popup.close();
                    return { success: false, error: 'Could not force download from popup' };
                }

            } else {
                throw new Error('Timeout waiting for download or popup');
            }

        } catch (error: any) {
            log.error('Download failed.', { fileName, error });
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
                    log.info('Skipping duplicate.', { fileName: file.name });
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped', filePath: existingPath });
                    if (onProgress) onProgress(file.name, 'skipped');
                    return false;
                }
            }
            return true;
        });

        log.info(`Starting parallel download for ${queue.length} files with 3 workers.`);

        const courseUrl = page.url();
        const CONCURRENCY = 3;
        let globalError: string | null = null;

        const processQueue = async (workerId: number) => {
            // Worker 0 uses the main page, others create new pages
            const workerPage = workerId === 0 ? page : await page.context().newPage();

            try {
                // If new page, navigate to course
                if (workerId !== 0) {
                    log.info(`Worker ${workerId} navigating to course.`);
                    await workerPage.goto(courseUrl, { waitUntil: 'domcontentloaded' });
                }

                while (queue.length > 0) {
                    const file = queue.shift();
                    if (!file) break;

                    if (globalError) {
                        log.info(`Worker ${workerId} aborting nicely due to global error.`);
                        break;
                    }

                    log.info(`Worker ${workerId} processing file.`, { fileName: file.name });

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
                            log.info(`Worker ${workerId} detected session expiration. Aborting queue.`);
                            break;
                        } else {
                            failed++;
                            results.push({ fileName: file.name, status: 'failed' });
                            if (onProgress) onProgress(file.name, 'failed');
                        }
                    }
                }
            } catch (e) {
                log.error(`Worker ${workerId} error.`, { error: e });
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


}
