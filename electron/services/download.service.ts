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
import { finalizeDownload, MAX_DOWNLOAD_BYTES, reserveDownloadPart } from './file-validation.service';
import { errorMessage } from '../../shared/errors';

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
        let routed = false;
        let partPath: string | undefined;
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
            let reportRouteFailure!: (error: unknown) => void;
            // Route callbacks run outside this method's try/catch. Resolve an
            // outcome so even a failure before the race has no unhandled rejection.
            const routeFailure = new Promise<{ type: 'route-error'; error: unknown }>(resolve => {
                reportRouteFailure = error => resolve({ type: 'route-error', error });
            });
            await page.route('**/*', async (route) => {
                try {
                    const response = await route.fetch();
                    const ct = response.headers()['content-type'] || '';
                    // Capture the type if it's a document, not a page resource
                    if (ct && !ct.includes('text/html') && !ct.includes('javascript') && !ct.includes('css') && !ct.includes('image/')) {
                        detectedContentType = ct.split(';')[0].trim();
                    }
                    await route.fulfill({ response });
                } catch (error) {
                    try {
                        await route.abort();
                    } catch (abortError) {
                        log.warn('Failed to abort intercepted request.', { error: abortError });
                    }
                    reportRouteFailure(error);
                }
            });
            routed = true;

            // Setup listeners
            const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
            const popupPromise = page.waitForEvent('popup', { timeout: 60000 });
            // Early action failures skip the race; browser shutdown still rejects both waits.
            void downloadPromise.catch(() => {});
            void popupPromise.catch(() => {});

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
                downloadPromise.then(d => ({ type: 'download' as const, data: d })),
                popupPromise.then(p => ({ type: 'popup' as const, data: p })),
                routeFailure,
                new Promise<{ type: 'timeout' }>(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
            ]);

            if (result.type === 'route-error') {
                throw new Error(errorMessage(result.error));
            }

            if (result.type === 'download') {
                const download = result.data;

                partPath = await reserveDownloadPart(courseFolder, safeFileName);
                await download.saveAs(partPath);

                const tooLargeError = await rejectIfTooLarge(partPath);
                if (tooLargeError) {
                    partPath = undefined;
                    return { success: false, error: tooLargeError };
                }

                const outcome = await finalizeDownload({
                    partPath,
                    dir: courseFolder,
                    fileName: safeFileName,
                    hintFileName: download.suggestedFilename(),
                    contentType: detectedContentType ?? undefined
                }).finally(() => { partPath = undefined; });

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
                    partPath = await reserveDownloadPart(courseFolder, safeFileName);
                    await popupDownload.saveAs(partPath);

                    const tooLargePopupError = await rejectIfTooLarge(partPath);
                    if (tooLargePopupError) {
                        partPath = undefined;
                        await popup.close();
                        return { success: false, error: tooLargePopupError };
                    }

                    const outcome = await finalizeDownload({
                        partPath,
                        dir: courseFolder,
                        fileName: safeFileName,
                        hintFileName: popupDownload.suggestedFilename()
                    }).finally(() => { partPath = undefined; });

                    if (!outcome.ok) {
                        await popup.close();
                        if (outcome.reason === 'session-expired') throw new Error('JSF_SESSION_EXPIRED');
                        return { success: false, error: outcome.error };
                    }

                    log.info('Downloaded from popup.', { filePath: outcome.filePath });
                    await popup.close();
                    return { success: true, filePath: outcome.filePath };
                } catch (e: any) {
                    if (partPath) {
                        await fs.promises.unlink(partPath).catch(() => { });
                        partPath = undefined;
                    }
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

                let reloadError: unknown;
                try {
                    const reloadDownloadPromise = popup.waitForEvent('download', { timeout: 15000 });
                    // O reload em si dispara o download e o Chrome aborta a navegação
                    // (`net::ERR_ABORTED`); quem decide sucesso é `reloadDownloadPromise`,
                    // não essa rejeição (DL-010). Guardada para o log de falha: sem ela,
                    // um reload quebrado de verdade só aparece como timeout de 15s.
                    //
                    // As duas promises precisam de tratador desde a criação, na ordem
                    // em que são declaradas: se o `await` de `reloadDownloadPromise`
                    // vier depois do `await` de `popup.reload()`, e o reload ainda
                    // estiver pendente quando o timeout de 15s estourar, a rejeição
                    // fica sem tratador até esse segundo `await` — unhandledRejection
                    // seguido de PromiseRejectionHandledWarning (DL-011).
                    const reloadPromise = popup.reload().catch((e: unknown) => { reloadError = e; });
                    const download = await reloadDownloadPromise;
                    await reloadPromise;

                    partPath = await reserveDownloadPart(courseFolder, safeFileName);
                    await download.saveAs(partPath);

                    const tooLargeReloadError = await rejectIfTooLarge(partPath);
                    if (tooLargeReloadError) {
                        partPath = undefined;
                        await popup.close();
                        return { success: false, error: tooLargeReloadError };
                    }

                    const outcome = await finalizeDownload({
                        partPath,
                        dir: courseFolder,
                        fileName: safeFileName,
                        hintFileName: download.suggestedFilename()
                    }).finally(() => { partPath = undefined; });

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
                    log.warn('Reload strategy failed.', { error: e, reloadError });
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
        } finally {
            if (partPath) await fs.promises.unlink(partPath).catch(() => { });
            // Sem isso, cada tentativa que não terminou em download empilhava
            // mais um interceptador na página (auditoria cc0b0d7).
            if (routed) await page.unroute('**/*').catch((e: unknown) => log.warn('Failed to unroute page.', { error: e }));
        }
    }

}
