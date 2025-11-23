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
                let responseCount = 0;

                const responseHandler = async (response: Response) => {
                    responseCount++;
                    const url = response.url();
                    const contentType = response.headers()['content-type'] || '';
                    const contentDisposition = response.headers()['content-disposition'] || '';
                    const status = response.status();

                    console.log(`[Parent Response #${responseCount}] ${status} ${url}`);
                    console.log(`  Content-Type: ${contentType}`);
                    if (contentDisposition) {
                        console.log(`  Content-Disposition: ${contentDisposition}`);
                    }

                    if (contentType.includes('application/pdf') ||
                        contentType.includes('application/octet-stream') ||
                        contentDisposition.includes('attachment') ||
                        contentType.includes('application/force-download')) {

                        try {
                            const buffer = await response.body();
                            console.log(`  !! File response, buffer size: ${buffer.length} bytes`);

                            if (buffer.length > 500) {
                                const isPdf = this.isPdf(buffer);
                                console.log(`  !! Is PDF: ${isPdf}`);

                                if (isPdf) {
                                    console.log(`  ✓✓✓ Found PDF in response!`);
                                    pdfData = buffer;
                                }
                            }
                        } catch (e: any) {
                            console.log(`  Error getting body: ${e.message}`);
                        }
                    }
                };

                console.log('Attaching response listener to parent page...');
                page.on('response', responseHandler);

                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

                await link.click({ force: true });

                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                page.off('response', responseHandler);
                console.log(`Total responses captured: ${responseCount}`);

                if (result.type === 'download') {
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded: ${filePath}`);
                    return { success: true, filePath };

                } else if (result.type === 'popup') {
                    const popup = result.data;
                    console.log(`Popup opened: ${popup.url()}`);

                    if (pdfData) {
                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }
                        fs.writeFileSync(finalPath, pdfData);
                        console.log(`✓ Saved PDF from parent page: ${finalPath} (${pdfData.length} bytes)`);
                        await popup.close();
                        return { success: true, filePath: finalPath };
                    }

                    console.log('No PDF captured from parent. Checking popup page source...');
                    try {
                        await popup.waitForLoadState('domcontentloaded', { timeout: 10000 });

                        const pdfUrl = await popup.evaluate(() => {
                            const embeds = document.querySelectorAll('embed[type="application/pdf"]');
                            for (const embed of embeds) {
                                const src = (embed as HTMLEmbedElement).src;
                                if (src && src !== 'about:blank' && !src.startsWith('blob:')) {
                                    return src;
                                }
                            }

                            const scripts = document.querySelectorAll('script');
                            for (const script of scripts) {
                                const match = script.textContent?.match(/blob:[^"'\s]+/);
                                if (match) {
                                    return match[0];
                                }
                            }

                            return null;
                        });

                        console.log(`Extracted URL from popup: ${pdfUrl}`);

                        if (pdfUrl && !pdfUrl.startsWith('blob:')) {
                            const context = popup.context();
                            const response = await context.request.get(pdfUrl);
                            const buffer = await response.body();

                            if (this.isPdf(buffer)) {
                                let finalPath = filePath;
                                if (!finalPath.toLowerCase().endsWith('.pdf')) {
                                    finalPath += '.pdf';
                                }
                                fs.writeFileSync(finalPath, buffer);
                                console.log(`✓ Saved from extracted URL: ${finalPath}`);
                                await popup.close();
                                return { success: true, filePath: finalPath };
                            }
                        }
                    } catch (e) {
                        console.log(`Error extracting from popup: ${e}`);
                    }

                    await popup.close();
                    return { success: false, error: 'Could not capture PDF data' };

                } else {
                    throw new Error('Timeout waiting for download or popup');
                }

            } else {
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
