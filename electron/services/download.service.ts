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

                // NEW STRATEGY: CDP Download Behavior
                // We hook into the popup creation to force Chrome to download files
                // instead of displaying them in the PDF viewer.

                const popupHandler = async (popup: Page) => {
                    console.log('Popup detected! Configuring CDP download behavior...');
                    try {
                        const client = await popup.context().newCDPSession(popup);
                        await client.send('Page.setDownloadBehavior', {
                            behavior: 'allow',
                            downloadPath: courseFolder
                        });
                        console.log(`CDP download behavior set to: ${courseFolder}`);
                    } catch (e) {
                        console.error('Failed to set CDP behavior:', e);
                    }
                };

                page.on('popup', popupHandler);

                // Also listen for responses just in case
                const responseHandler = async (response: Response) => {
                    // Log everything to be sure
                    console.log(`[Response] ${response.status()} ${response.url()} [${response.headers()['content-type']}]`);
                };
                page.context().on('response', responseHandler);

                const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                const popupPromise = page.waitForEvent('popup', { timeout: 60000 });

                await link.click({ force: true });

                const result = await Promise.race([
                    downloadPromise.then(d => ({ type: 'download', data: d })),
                    popupPromise.then(p => ({ type: 'popup', data: p })),
                    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 65000))
                ]) as { type: string, data: any };

                // Cleanup
                page.off('popup', popupHandler);
                page.context().off('response', responseHandler);

                if (result.type === 'download') {
                    const download = result.data;
                    await download.saveAs(filePath);
                    console.log(`Downloaded via event: ${filePath}`);
                    return { success: true, filePath };

                } else if (result.type === 'popup') {
                    const popup = result.data;
                    console.log(`Popup opened: ${popup.url()}`);

                    // Wait to see if a download starts automatically due to CDP
                    try {
                        console.log('Waiting for potential CDP-triggered download...');
                        // We can't easily wait for a file to appear, but we can wait a bit
                        await new Promise(resolve => setTimeout(resolve, 5000));

                        // Check if any new file appeared in the folder
                        const files = fs.readdirSync(courseFolder);
                        // Sort by creation time
                        const recentFiles = files.map(f => ({
                            name: f,
                            time: fs.statSync(path.join(courseFolder, f)).birthtimeMs
                        })).sort((a, b) => b.time - a.time);

                        if (recentFiles.length > 0) {
                            const newestFile = recentFiles[0];
                            const newestFilePath = path.join(courseFolder, newestFile.name);
                            const now = Date.now();

                            // If file was created in the last 10 seconds
                            if (now - newestFile.time < 10000) {
                                console.log(`Found recently created file: ${newestFile.name}`);

                                // Rename to target filename
                                let finalPath = filePath;
                                if (!finalPath.toLowerCase().endsWith('.pdf') && !newestFile.name.toLowerCase().endsWith('.pdf')) {
                                    finalPath += '.pdf';
                                } else if (newestFile.name.toLowerCase().endsWith('.pdf') && !finalPath.toLowerCase().endsWith('.pdf')) {
                                    finalPath += '.pdf';
                                }

                                // Wait for file to be closed/finished writing
                                await new Promise(resolve => setTimeout(resolve, 2000));

                                try {
                                    fs.renameSync(newestFilePath, finalPath);
                                    console.log(`Renamed ${newestFile.name} to ${path.basename(finalPath)}`);
                                    await popup.close();
                                    return { success: true, filePath: finalPath };
                                } catch (e) {
                                    console.log(`Could not rename file (maybe still downloading?): ${e}`);
                                }
                            }
                        }
                    } catch (e) {
                        console.log('Error checking for CDP download:', e);
                    }

                    // Fallback: Try to print to PDF (since we know it renders!)
                    console.log('CDP download failed. Attempting to print page to PDF...');
                    try {
                        await popup.waitForLoadState('networkidle');
                        let finalPath = filePath;
                        if (!finalPath.toLowerCase().endsWith('.pdf')) {
                            finalPath += '.pdf';
                        }
                        await popup.pdf({ path: finalPath });
                        console.log(`Saved via Page.pdf(): ${finalPath}`);
                        await popup.close();
                        return { success: true, filePath: finalPath };
                    } catch (e) {
                        console.log(`Print to PDF failed: ${e}`);
                    }

                    await popup.close();
                    return { success: false, error: 'Could not capture PDF via CDP or Print' };

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
