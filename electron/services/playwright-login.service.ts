import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.service';

/**
 * Uses Playwright to automate a real browser for UFC SIGAA login.
 * This handles all the complexity that the HTTP approach couldn't solve.
 */
export class PlaywrightLoginService {
    private browser: Browser | null = null;
    private storedCookies: any[] = [];
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async login(username: string, password: string): Promise<{ success: boolean; cookies?: any[]; userName?: string; error?: string }> {
        try {
            console.log('Playwright: Launching browser...');

            this.browser = await chromium.launch({
                headless: true
            });

            const context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });
            const page = await context.newPage();

            console.log('Playwright: Navigating to login page...');
            await page.goto('https://si3.ufc.br/sigaa/verTelaLogin.do');

            console.log('Playwright: Filling in credentials...');
            await page.fill('input[name="user.login"]', username);
            await page.fill('input[name="user.senha"]', password);

            console.log('Playwright: Clicking login button...');
            await page.click('input[name="entrar"]');

            // Wait for navigation after login
            console.log('Playwright: Waiting for navigation...');
            await page.waitForLoadState('networkidle');

            // Check if login was successful
            const currentUrl = page.url();
            console.log('Playwright: Current URL after login:', currentUrl);

            // If we're still on the login page, login failed
            if (currentUrl.includes('verTelaLogin') || currentUrl.includes('logar.do')) {
                // Check for error message on page
                const errorElement = await page.$('.erro, .mensagemErro, .alert');
                const errorMessage = errorElement ? await errorElement.textContent() : 'Unknown error';

                await this.close();
                return { success: false, error: errorMessage || 'Login failed - still on login page' };
            }

            // Login successful! Extract user data from the page
            console.log('Playwright: Login successful! Extracting user data...');

            // Stay on current page after login to extract user info
            const nameElement = await page.$('.nome_usuario, .info-usuario .nome');
            const userName = nameElement ? await nameElement.textContent() : null;

            console.log('Playwright: Extracted user name:', userName);

            // Extract cookies
            const cookies = await context.cookies();
            console.log('Playwright: Found cookies:', cookies.map(c => c.name).join(', '));

            // Store cookies for future use
            this.storedCookies = cookies;

            this.context = context;
            this.page = page;
            console.log('Playwright: Keeping session alive for cookie refresh');

            return {
                success: true,
                cookies,
                userName: userName?.trim() || 'User'
            };

        } catch (error: any) {
            console.error('Playwright: Error during login:', error);
            await this.close();
            return { success: false, error: error.message };
        }
    }

    /**
 * Get fresh cookies from the live Playwright session
 */
    async getCookies(): Promise<any[]> {
        if (!this.context) {
            console.warn('Playwright: No active context, returning stored cookies');
            return this.storedCookies || [];
        }
        try {
            const cookies = await this.context.cookies();
            this.storedCookies = cookies;
            console.log('Playwright: Refreshed cookies');
            return cookies;
        } catch (error) {
            console.error('Playwright: Error getting cookies:', error);
            return this.storedCookies || [];
        }
    }

    async getCourses(): Promise<{ success: boolean; courses?: any[]; error?: string }> {
        try {
            logger.info('Playwright: Launching browser to fetch courses...');

            // Check if we have stored cookies
            if (!this.storedCookies || this.storedCookies.length === 0) {
                return { success: false, error: 'No stored session - please login first' };
            }

            this.browser = await chromium.launch({
                headless: true
            });

            const context = await this.browser.newContext();

            // Inject stored cookies
            logger.info('Playwright: Injecting stored session cookies...');
            await context.addCookies(this.storedCookies);

            const page = await context.newPage();

            // Enable console logs from the browser to Node.js
            page.on('console', msg => console.log('Playwright Browser Log:', msg.text()));

            // Start at home page
            logger.info('Playwright: Navigating to home page...');
            await page.goto('https://si3.ufc.br/sigaa/paginaInicial.do');
            await page.waitForLoadState('networkidle');

            // Check if we got redirected to login (cookies expired)
            if (page.url().includes('verTelaLogin')) {
                await this.close();
                return { success: false, error: 'Session expired - please login again' };
            }

            // Click on student portal link
            console.log('Playwright: Looking for "Menu Discente" link...');
            try {
                // Click on "Menu Discente" link using exact href - use .first() to avoid strict mode error
                const studentLink = page.locator('a[href="/sigaa/verPortalDiscente.do"]').first();
                await studentLink.click({ timeout: 5000 });
                await page.waitForLoadState('networkidle');
                console.log('Playwright: Clicked Menu Discente, current URL:', page.url());
            } catch (clickError) {
                console.log('Playwright: Auto-click failed:', clickError);
                console.log('Playwright: Current URL:', page.url());
                // Try to navigate directly as fallback
                console.log('Playwright: Trying direct navigation to verPortalDiscente.do...');
                await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
                await page.waitForLoadState('networkidle');
            }

            // Wait a bit for dynamic content
            await page.waitForTimeout(1000);

            // Extract courses with robust selector-based logic
            console.log('Playwright: Extracting courses from page...');
            const courses = await page.evaluate(() => {
                const results: any[] = [];
                // Find all rows that might contain courses
                const rows = document.querySelectorAll('tr');

                for (const row of rows) {
                    // Look for the hidden ID input and the course link
                    const idInput = row.querySelector('input[name="idTurma"]') as HTMLInputElement;
                    const nameLink = row.querySelector('a[id*="turmaVirtual"]');
                    const periodCell = row.querySelector('td.info center'); // Period is often in a center tag

                    if (idInput && nameLink && nameLink.textContent) {
                        const fullText = nameLink.textContent.trim();
                        const id = idInput.value;
                        console.log(`[Debug] Course ${fullText} Link: href="${nameLink.getAttribute('href')}", onclick="${nameLink.getAttribute('onclick')}"`);

                        // Course codes follow pattern: 2 letters + 4 digits (e.g., CB0699, CK0181)
                        // Format usually: "CODE - NAME"
                        const parts = fullText.split(' - ');

                        if (parts.length >= 2) {
                            results.push({
                                id: id,
                                code: parts[0].trim(),
                                name: parts.slice(1).join(' - ').trim(),
                                period: periodCell ? (periodCell as HTMLElement).innerText.split('\n')[0] : '',
                                href: nameLink.getAttribute('href'),
                                onclick: nameLink.getAttribute('onclick')
                            });
                        }
                    }
                }

                return results;
            });

            console.log('Playwright: Found courses:', courses.length);

            // Save to debug file for analysis
            try {
                const debugPath = path.join(process.cwd(), 'debug_courses.json');
                fs.writeFileSync(debugPath, JSON.stringify(courses, null, 2));
                console.log(`Playwright: Saved course debug info to ${debugPath}`);
            } catch (err) {
                console.error('Playwright: Failed to save debug info:', err);
            }

            if (courses.length > 0) {
                console.log('Playwright: Sample courses:', courses.slice(0, 3));
            }

            // DO NOT CLOSE BROWSER HERE - Keep it alive for course entry
            // await this.close(); 

            // Store the page/context for reuse
            this.context = context;
            this.page = page;

            return { success: true, courses };

        } catch (error: any) {
            console.error('Playwright: Error fetching courses:', error);
            await this.close();
            return { success: false, error: error.message };
        }
    }

    async enterCourseAndGetHTML(courseId: string, courseName: string): Promise<{ success: boolean; html?: string; cookies?: any[]; error?: string }> {
        let page: Page | null = null;
        try {
            if (!this.browser || !this.context) {
                // If browser is closed, relaunch it
                console.log('Playwright: Browser not active, relaunching...');
                await this.getCourses(); // This will relaunch and set this.context
            }

            // Create a NEW page for this specific request to allow parallelism
            page = await this.context!.newPage();

            // Always force navigation to portal to ensure clean state
            console.log(`Playwright: Navigating to portal for ${courseName}...`);
            await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
            await page.waitForLoadState('networkidle');

            // Enter the course
            console.log(`Playwright: Entering course ${courseId} (${courseName})...`);
            const entered = await page.evaluate((id: string) => {
                const inputs = Array.from(document.querySelectorAll('input[name="idTurma"]'));
                const targetInput = inputs.find(input => (input as HTMLInputElement).value === id);

                if (targetInput) {
                    const row = targetInput.closest('tr');
                    if (row) {
                        const link = row.querySelector('a[id*="turmaVirtual"]') as HTMLElement;
                        if (link) {
                            console.log('Clicking course:', link.innerText);
                            link.click();
                            return { success: true };
                        }
                    }
                }
                return { success: false };
            }, courseId);

            if (!entered.success) {
                await page.close();
                return { success: false, error: 'Course link not found in portal' };
            }

            await page.waitForLoadState('networkidle');
            // Wait for course selection to register
            await page.waitForTimeout(2000);

            // Navigate to AVA to ensure we are in the course context
            // Note: Clicking the link usually redirects to AVA, but we ensure it here
            if (!page.url().includes('ava/index.jsf')) {
                console.log('Playwright: URL not AVA after click, forcing navigation...');
                await page.goto('https://si3.ufc.br/sigaa/ava/index.jsf');
                await page.waitForLoadState('networkidle');
            }

            // Wait for dynamic content
            await page.waitForTimeout(1000);

            // VERIFY: Check if we are actually in the correct course
            const pageContent = await page.content();
            // Normalize strings for comparison (remove special chars, case insensitive)
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const normalizedContent = normalize(pageContent);
            const normalizedName = normalize(courseName);

            // We check if the course name (or a significant part of it) is present
            // This is a heuristic; exact match might fail due to formatting
            if (!normalizedContent.includes(normalizedName.substring(0, 20))) {
                console.warn(`Playwright: WARNING - Course name "${courseName}" not found in page content! Possible contamination.`);
            } else {
                console.log(`Playwright: Verified we are in course "${courseName}"`);
            }

            // HYBRID NAVIGATION STRATEGY:
            // 1. Check if files are present on the Main Page (e.g., Calculus).
            // 2. If not, navigate to "Conteúdo" (e.g., FMC).

            const hasFilesOnMainPage = await page.evaluate(() => {
                const contentDiv = document.getElementById('conteudo');
                if (!contentDiv) return false;

                // Look for jsfcljs links in the main content area
                const links = Array.from(contentDiv.querySelectorAll('a[onclick*="jsfcljs"]'));

                // Filter out "Visualizar" links (usually News/Evaluations) and check for actual file links
                const hasFileLinks = links.some(link => {
                    const text = link.textContent?.trim() || '';
                    return text !== '' && !text.includes('(Visualizar)');
                });

                // Check for the specific "No topics" message
                const noTopicsMessage = document.body.innerText.includes('O Sistema detectou que até agora seu professor não criou nenhum tópico de aula');

                return hasFileLinks && !noTopicsMessage;
            });

            if (hasFilesOnMainPage) {
                console.log('Playwright: Files detected on Main Page. Skipping navigation.');
            } else {
                console.log('Playwright: Main page seems empty or has no files. Attempting to navigate to "Conteúdo"...');
                try {
                    // Try to find and click the "Conteúdo" menu item
                    const navigated = await page.evaluate(() => {
                        // Helper to find text in elements
                        const containsText = (el: Element, text: string) => el.textContent?.trim() === text;

                        // 1. Try to find "Conteúdo" directly
                        const menuItems = Array.from(document.querySelectorAll('.itemMenu'));
                        let conteudoItem = menuItems.find(item => containsText(item, 'Conteúdo'));

                        if (conteudoItem) {
                            const link = conteudoItem.closest('a');
                            if (link) {
                                link.click();
                                return true;
                            }
                        }

                        // 2. If not visible, maybe we need to expand "Materiais"
                        // (This part is tricky purely via JS without UI interaction, but click() on hidden elements often works in JSF)
                        return false;
                    });

                    if (navigated) {
                        await page.waitForLoadState('networkidle');
                        await page.waitForTimeout(2000); // Wait for content load
                        console.log('Playwright: Successfully navigated to "Conteúdo".');
                    } else {
                        console.warn('Playwright: Could not find "Conteúdo" menu item. Staying on Main Page.');
                    }
                } catch (navError) {
                    console.error('Playwright: Error navigating to Conteúdo:', navError);
                }
            }

            // Get HTML and Cookies
            const html = await page.content();
            const cookies = await this.context!.cookies();

            console.log(`Playwright: Captured HTML for course ${courseId} (${html.length} bytes)`);

            // Close the page to free resources
            await page.close();

            return { success: true, html, cookies };

        } catch (error: any) {
            console.error('Playwright: Error entering course:', error);
            if (page) {
                await page.close().catch(() => { });
            }
            return { success: false, error: error.message };
        }
    }


    // Kept for backward compatibility but now unused by the new flow
    private async navigateToCourse(page: any, courseId: string): Promise<boolean> {
        try {
            // Go to portal
            await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
            await page.waitForLoadState('networkidle');

            // Enter the course
            console.log(`Playwright: Entering course ${courseId}...`);
            const entered = await page.evaluate((id: string) => {
                const inputs = Array.from(document.querySelectorAll('input[name="idTurma"]'));
                const targetInput = inputs.find(input => (input as HTMLInputElement).value === id);

                if (targetInput) {
                    const row = targetInput.closest('tr');
                    if (row) {
                        const link = row.querySelector('a[id*="turmaVirtual"]') as HTMLElement;
                        if (link) {
                            console.log('Clicking course:', link.innerText);
                            link.click();
                            return { success: true };
                        }
                    }
                }
                return { success: false };
            }, courseId);

            if (!entered.success) {
                console.error('Playwright: Course not found in portal');
                return false;
            }

            await page.waitForLoadState('networkidle');
            // Wait for course selection to register
            await page.waitForTimeout(2000);

            // Navigate to AVA
            await page.goto('https://si3.ufc.br/sigaa/ava/index.jsf');
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            return true;
        } catch (error) {
            console.error('Playwright: Navigation error:', error);
            return false;
        }
    }

    async downloadFile(
        courseId: string,
        courseName: string,
        fileName: string,
        fileUrl: string,
        basePath: string,
        _downloadedFiles: Record<string, any>,
        script?: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        let localBrowser: Browser | null = null;
        try {
            const { DownloadService } = await import('./download.service');

            // Launch a dedicated browser for this download to avoid concurrency issues
            localBrowser = await chromium.launch({ headless: false });
            const downloadService = new DownloadService(localBrowser);

            const context = await localBrowser.newContext();
            // Inject stored cookies
            if (this.storedCookies.length > 0) {
                await context.addCookies(this.storedCookies);
            }

            const page = await context.newPage();

            // Navigate to course page first
            const navigated = await this.navigateToCourse(page, courseId);
            if (!navigated) {
                await localBrowser.close();
                return { success: false, error: 'Failed to navigate to course page' };
            }

            console.log(`Playwright: Downloading file ${fileName} `);
            console.log(`Playwright: Script present: ${!!script} `);

            const result = await downloadService.downloadFile(
                page,
                fileUrl,
                fileName,
                courseName,
                basePath,
                script
            );

            await localBrowser.close();
            return result;
        } catch (error: any) {
            console.error('Playwright: Download error:', error);
            if (localBrowser) {
                await localBrowser.close();
            }
            return { success: false, error: error.message };
        }
    }

    async downloadAllFiles(
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
        results: any[];
    }> {
        let localBrowser: Browser | null = null;
        try {
            const { DownloadService } = await import('./download.service');

            // Launch a dedicated browser for this batch download
            localBrowser = await chromium.launch({ headless: false });
            const downloadService = new DownloadService(localBrowser);

            const context = await localBrowser.newContext();
            // Inject stored cookies
            if (this.storedCookies.length > 0) {
                await context.addCookies(this.storedCookies);
            }

            const page = await context.newPage();

            // Navigate to course page first
            const navigated = await this.navigateToCourse(page, courseId);
            if (!navigated) {
                await localBrowser.close();
                return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
            }

            const result = await downloadService.downloadCourseFiles(
                page,
                courseId,
                courseName,
                files,
                basePath,
                downloadedFiles,
                onProgress
            );

            await localBrowser.close();
            return result;
        } catch (error: any) {
            console.error('Playwright: Download all error:', error);
            if (localBrowser) {
                await localBrowser.close();
            }
            return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
        }
    }

    async close() {
        if (this.browser) {
            console.log('Playwright: Closing browser...');
            await this.browser.close();
            this.browser = null;
        }
    }
    async getUserAgent(): Promise<string> {
        if (this.page) {
            return await this.page.evaluate(() => navigator.userAgent);
        }
        if (this.context) {
            const page = await this.context.newPage();
            const ua = await page.evaluate(() => navigator.userAgent);
            await page.close();
            return ua;
        }
        // Fallback if no browser is open (shouldn't happen if we are syncing)
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    }
}
