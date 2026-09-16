// DOC-003: este arquivo não tem `import ... from` estático em lugar nenhum.
// Ele é carregado por `await import('./download.service')` em
// `playwright-login.service.ts` (`PlaywrightLoginService.downloadFile`).
// Cadeia real até um ponto de entrada:
//   IPC `download-file` (main.ts) → SigaaService.downloadFile
//   → SigaaService.downloadViaPlaywright (plano B, BUG-004) → PlaywrightLoginService.downloadFile → aqui
// Busca por `import ... from` vai dizer que é código morto. Não é.
import { Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.service';
import { resolveDownloadTarget, ensureDirInsideRoot } from './download-path';
import { finalizeDownload, MAX_DOWNLOAD_BYTES } from './file-validation.service';

const log = logger.scope('Download');

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
    async downloadFile(
        page: Page,
        fileName: string,
        courseName: string,
        basePath: string,
        fileId: string,
        script?: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            const { dir: courseFolder, fullPath: filePath } = resolveDownloadTarget(basePath, courseName, fileName);
            ensureDirInsideRoot(basePath, courseFolder);
            // Nome já sanitizado por `resolveDownloadTarget`; reaproveitado como
            // base para o `.part` e para `finalizeDownload`.
            const safeFileName = path.basename(filePath);

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

            // Casamento pelo id do `onclick` JSF (`,id,<valor>,` — o mesmo formato
            // que `jsfParam` extrai no parser), nunca pelo texto da linha: "Aula 1"
            // casava "Aula 10" via `includes`, e a linha errada era baixada
            // (DL-007 item 9).
            const freshAction = await page.evaluate((id) => {
                const rows = Array.from(document.querySelectorAll('.item,.item-impar,.item-par, .form-baixar-arquivo'));
                for (const row of rows) {
                    const link = row.tagName.toLowerCase() === 'a' ? row : row.querySelector('.form-baixar-arquivo, a[href]');
                    if (!link) continue;

                    const onclick = link.getAttribute('onclick');
                    const idMatch = onclick && onclick.match(/,id,([^,'"]+)/);
                    if (idMatch && idMatch[1] === id) return onclick;
                }
                return null;
            }, fileId);

            if (freshAction) {
                log.info('Executing completely fresh JSF script from current DOM.');
                await page.evaluate((scriptStr: string) => {
                    const func = new Function(scriptStr.replace('return false', ''));
                    func();
                }, freshAction);
            } else {
                log.info('Failed to find fresh action. Fallback to cached original script.');
                if (script) {
                    await page.evaluate((scriptStr: string) => {
                        const func = new Function(scriptStr.replace('return false', ''));
                        func();
                    }, script);
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
                    } catch (e) {
                        try {
                            await route.continue();
                        } catch (continueError) {
                            log.warn('Popup route interception failed and the fallback continue() also failed.', { error: e, continueError });
                        }
                    }
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

}
