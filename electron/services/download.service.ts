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

                let pdfData: Buffer | null = null;

                // Use context-level listener to catch responses from ALL pages (parent + popup)
                const responseHandler = async (response: Response) => {
                    const url = response.url();
                    const contentType = response.headers()['content-type'] || '';
                    const contentDisposition = response.headers()['content-disposition'] || '';

                    // Filter out noisy requests (images, css, etc.)
                    if (contentType.includes('image') || contentType.includes('css') || contentType.includes('javascript')) {
                        return;
                    }

                    console.log(`[Context Response] ${response.status()} ${url}`);
                    console.log(`  Type: ${contentType}`);

                    if (contentType.includes('application/pdf') ||
                        contentType.includes('application/octet-stream') ||
                        contentDisposition.includes('attachment')) {

                        try {
                            const buffer = await response.body();
                            console.log(`  !! Potential file, size: ${buffer.length}`);

                            if (buffer.length > 500 && this.isPdf(buffer)) {
                                console.log(`  ✓✓✓ Found PDF in context response!`);
                                pdfData = buffer;
                            }
                        } catch (e: any) {
                            // ignore
                        }
                    }
                };

                console.log('Attaching context response listener...');
                page.context().on('response', responseHandler);

                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

                await link.click({ force: true });

                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                if (result.type === 'download') {
                    page.context().off('response', responseHandler);
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded: ${filePath}`);
                    return { success: true, filePath };

                } else if (result.type === 'popup') {
                    const popup = result.data;
                    console.log(`Popup opened: ${popup.url()}`);

                    // Wait a bit for loading
                    await popup.waitForLoadState('domcontentloaded');
                    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s for any redirects/scripts

                    // Check if we already caught it
                    if (pdfData) {
                        page.context().off('response', responseHandler);
                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }
                        fs.writeFileSync(finalPath, pdfData);
                        console.log(`✓ Saved PDF from context capture: ${finalPath}`);
                        await popup.close();
                        return { success: true, filePath: finalPath };
                    }

                    // Debug: Dump HTML to see what's inside
                    try {
                        const html = await popup.content();
                        console.log('--- Popup HTML Content Start ---');
                        console.log(html.substring(0, 2000)); // Log first 2000 chars
                        console.log('--- Popup HTML Content End ---');
                    } catch (e) {
                        console.log('Could not dump HTML');
                    }

                    // Try to find embed again
                    const pdfUrl = await popup.evaluate(() => {
                        const embed = document.querySelector('embed');
                        return embed ? embed.src : null;
                    });
                    console.log(`Final embed src check: ${pdfUrl}`);

                    page.context().off('response', responseHandler);
                    await popup.close();
                    return { success: false, error: 'Could not capture PDF (check logs for HTML dump)' };

                } else {
                    page.context().off('response', responseHandler);
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
