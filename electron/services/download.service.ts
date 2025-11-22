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

            // Check if file already exists (checking both with and without extension if possible)
            if (fs.existsSync(filePath)) {
                console.log(`File already exists: ${filePath}`);
                return { success: true, filePath };
            }
            if (fs.existsSync(filePath + '.pdf')) {
                console.log(`File already exists: ${filePath}.pdf`);
                return { success: true, filePath: filePath + '.pdf' };
            }

            // Ensure we are on the page (sometimes downloads trigger reload)
            if (page.url() === 'about:blank') {
                throw new Error('Page lost context (about:blank)');
            }

            console.log(`Looking for file link with text: "${fileName}"`);

            // Try to find the specific anchor tag containing the text
            const link = page.locator(`a:has-text("${fileName}")`).first();

            if (await link.isVisible()) {
                console.log(`Found link for ${fileName}, clicking...`);

                // Setup response listener BEFORE clicking to avoid race conditions
                let pdfResponse: any = null;
                const responseHandler = async (response: any) => {
                    try {
                        const contentType = response.headers()['content-type'];
                        if (contentType && (
                            contentType.includes('application/pdf') ||
                            contentType.includes('application/octet-stream') ||
                            contentType.includes('application/zip')
                        )) {
                            console.log(`Captured PDF response: ${response.url()} (${contentType})`);
                            pdfResponse = response;
                        }
                    } catch (e) { /* ignore */ }
                };

                page.context().on('response', responseHandler);

                // Race between download and popup (some files open in new tab)
                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

                // Use force click to bypass potential overlays
                await link.click({ force: true });

                // Wait for either download or popup
                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                // Clean up listener
                page.context().off('response', responseHandler);

                if (result.type === 'download') {
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded: ${filePath}`);
                    return { success: true, filePath };
                } else if (result.type === 'popup') {
                    const popup = result.data;

                    // Helper to save response body
                    const saveResponse = async (response: any, initialPath: string) => {
                        const status = response.status();
                        console.log(`Response status: ${status}`);

                        if (status >= 400) {
                            throw new Error(`Response failed with status ${status}`);
                        }

                        let finalPath = initialPath;
                        const contentType = response.headers()['content-type'];

                        // Append extension if missing
                        if (contentType && contentType.includes('application/pdf') && !finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                            console.log(`Appended .pdf extension: ${finalPath}`);
                        }

                        const buffer = await response.body();
                        console.log(`Buffer size: ${buffer.length} bytes`);

                        if (buffer.length < 1000) {
                            console.log(`Small buffer content: ${buffer.toString('utf-8')}`);
                        }

                        if (buffer.length === 0) {
                            throw new Error('Response body is empty');
                        }

                        fs.writeFileSync(finalPath, buffer);
                        console.log(`Saved popup content to: ${finalPath}`);
                        return finalPath;
                    };

                    // If we already captured a PDF response during the click/popup open
                    if (pdfResponse) {
                        console.log('Using captured PDF response from context...');
                        try {
                            const savedPath = await saveResponse(pdfResponse, filePath);
                            await popup.close();
                            return { success: true, filePath: savedPath };
                        } catch (e: any) {
                            console.error('Failed to save captured response:', e);
                            // Fallthrough to try waiting again?
                        }
                    }

                    // If not, maybe it's still loading?
                    console.log('Popup opened but no PDF response yet. Waiting...');
                    try {
                        // Now we can wait on the popup specifically if it hasn't finished
                        const response = await popup.waitForResponse((response: any) => {
                            const contentType = response.headers()['content-type'];
                            return contentType && (
                                contentType.includes('application/pdf') ||
                                contentType.includes('application/octet-stream')
                            );
                        }, { timeout: 15000 });

                        const savedPath = await saveResponse(response, filePath);
                        await popup.close();
                        return { success: true, filePath: savedPath };
                    } catch (e) {
                        console.log('No PDF response found in popup or save failed.');
                    }

                    // Fallback to URL check
                    const popupUrl = popup.url();
                    console.log(`Popup URL: ${popupUrl}`);

                    if (popupUrl.endsWith('.pdf') || popupUrl.includes('visualizar')) {
                        const context = page.context();
                        const response = await context.request.get(popupUrl);
                        const buffer = await response.body();

                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }

                        fs.writeFileSync(finalPath, buffer);
                        await popup.close();
                        return { success: true, filePath: finalPath };
                    }

                    await popup.close();
                    return { success: false, error: `Could not capture file from popup. URL: ${popupUrl}` };
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
                // Also check with .pdf extension
                if (fs.existsSync(existingPath + '.pdf')) {
                    console.log(`Skipping duplicate: ${file.name}.pdf`);
                    skipped++;
                    results.push({ fileName: file.name, status: 'skipped', filePath: existingPath + '.pdf' });
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
