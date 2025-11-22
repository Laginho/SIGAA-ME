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

            // Check if file already exists
            if (fs.existsSync(filePath)) {
                console.log(`File already exists: ${filePath}`);
                return { success: true, filePath };
            }
            if (fs.existsSync(filePath + '.pdf')) {
                console.log(`File already exists: ${filePath}.pdf`);
                return { success: true, filePath: filePath + '.pdf' };
            }

            // Ensure we are on the page
            if (page.url() === 'about:blank') {
                throw new Error('Page lost context (about:blank)');
            }

            console.log(`Looking for file link with text: "${fileName}"`);

            // Try to find the specific anchor tag containing the text
            const link = page.locator(`a:has-text("${fileName}")`).first();

            if (await link.isVisible()) {
                console.log(`Found link for ${fileName}, clicking...`);

                // Wait for popup
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });
                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });

                await link.click({ force: true });

                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                if (result.type === 'download') {
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded: ${filePath}`);
                    return { success: true, filePath };
                } else if (result.type === 'popup') {
                    const popup = result.data;
                    console.log(`Popup opened: ${popup.url()}`);

                    // Listen for ALL responses in the popup to see what's being loaded
                    let pdfResponse: any = null;
                    const popupResponseHandler = async (response: any) => {
                        const url = response.url();
                        const contentType = response.headers()['content-type'] || '';
                        const status = response.status();

                        console.log(`Popup response: ${url} (${status}) [${contentType}]`);

                        // Check if it's a PDF
                        if (contentType.includes('application/pdf') ||
                            contentType.includes('application/octet-stream') ||
                            contentType.includes('application/zip')) {
                            try {
                                const buffer = await response.body();
                                console.log(`Potential PDF response, size: ${buffer.length} bytes`);

                                // Verify it's actually a PDF
                                if (contentType.includes('application/pdf') && buffer.length > 0) {
                                    if (this.isPdf(buffer)) {
                                        console.log(`✓ Valid PDF found!`);
                                        pdfResponse = response;
                                    } else {
                                        console.log(`✗ Not a PDF (HTML wrapper or other)`);
                                    }
                                } else if (buffer.length > 0) {
                                    // Non-PDF file (zip, etc.)
                                    pdfResponse = response;
                                }
                            } catch (e) {
                                console.log(`Error reading response body: ${e}`);
                            }
                        }
                    };

                    popup.on('response', popupResponseHandler);

                    try {
                        // Wait for the popup to fully load
                        console.log('Waiting for popup to load...');
                        await popup.waitForLoadState('networkidle', { timeout: 30000 });
                        console.log('Popup loaded.');

                        // Give it extra time for any JavaScript to execute and load the PDF
                        await new Promise(resolve => setTimeout(resolve, 3000));

                        if (pdfResponse) {
                            console.log('Found PDF response, saving...');
                            const buffer = await pdfResponse.body();

                            let finalPath = filePath;
                            const contentType = pdfResponse.headers()['content-type'];
                            if (contentType && contentType.includes('application/pdf') && !finalPath.toLowerCase().endsWith('.pdf')) {
                                finalPath += '.pdf';
                                console.log(`Appended .pdf extension: ${finalPath}`);
                            }

                            fs.writeFileSync(finalPath, buffer);
                            console.log(`✓ Saved: ${finalPath} (${buffer.length} bytes)`);

                            await popup.close();
                            return { success: true, filePath: finalPath };
                        } else {
                            console.log('No PDF response captured. Trying to extract from embed...');

                            // Try to get the PDF from the embed element
                            const embedSrc = await popup.evaluate(() => {
                                const embed = document.querySelector('embed[type="application/pdf"]');
                                return embed ? (embed as HTMLEmbedElement).src : null;
                            });

                            console.log(`Embed src: ${embedSrc}`);

                            if (embedSrc && embedSrc !== 'about:blank' && !embedSrc.startsWith('blob:')) {
                                // Try to fetch the PDF from the embed URL
                                console.log(`Fetching PDF from embed URL: ${embedSrc}`);
                                const context = popup.context();
                                const response = await context.request.get(embedSrc);
                                const buffer = await response.body();

                                let finalPath = filePath;
                                if (!finalPath.toLowerCase().endsWith('.pdf')) {
                                    finalPath += '.pdf';
                                }

                                fs.writeFileSync(finalPath, buffer);
                                console.log(`✓ Saved from embed: ${finalPath}`);
                                await popup.close();
                                return { success: true, filePath: finalPath };
                            }

                            await popup.close();
                            return { success: false, error: 'Could not capture PDF from popup' };
                        }
                    } finally {
                        popup.off('response', popupResponseHandler);
                    }
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

    private isPdf(buffer: Buffer): boolean {
        // Check for %PDF magic bytes (25 50 44 46)
        if (buffer.length < 4) return false;
        return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    }
}
