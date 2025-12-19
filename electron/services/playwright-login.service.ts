import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
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

    // Store credentials for automatic re-login when session expires
    private storedUsername: string | null = null;
    private storedPassword: string | null = null;

    async login(username: string, password: string): Promise<{ success: boolean; cookies?: any[]; userName?: string; photoUrl?: string; error?: string }> {
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

            // Extract Photo URL
            const photoElement = await page.$('.foto-usuario img, .info-usuario img');
            let photoUrl = photoElement ? await photoElement.getAttribute('src') : null;

            // Fix relative URL for photo if needed
            if (photoUrl && !photoUrl.startsWith('http')) {
                photoUrl = `https://si3.ufc.br${photoUrl}`;
            }

            console.log('Playwright: Extracted user name:', userName);
            console.log('Playwright: Extracted photo URL:', photoUrl);

            // Extract cookies
            const cookies = await context.cookies();
            console.log(`Playwright: Found ${cookies.length} cookies:`, cookies.map(c => `${c.name} (${c.domain})`).join(', '));

            // Store cookies and credentials for future use
            this.storedCookies = cookies;
            this.storedUsername = username;
            this.storedPassword = password;

            this.context = context;
            this.page = page;
            console.log('Playwright: Keeping session alive for cookie refresh');

            return {
                success: true,
                cookies,
                userName: userName?.trim() || 'User',
                photoUrl: photoUrl || undefined
            };

        } catch (error: any) {
            console.error('Playwright: Error during login:', error);
            await this.close();
            return { success: false, error: error.message };
        }
    }

    async forceReset() {
        if (this.context) {
            console.log('Playwright: Force resetting context (Abort Navigation)...');
            try {
                await this.context.close();
            } catch (e) {
                console.error('Playwright: Error closing context during reset:', e);
            }
            this.context = null;
            this.page = null;
        }
    }

    /**
     * Re-login using stored credentials when session expires
     */
    async reloginWithStoredCredentials(): Promise<{ success: boolean; cookies?: any[]; error?: string }> {
        if (!this.storedUsername || !this.storedPassword) {
            return { success: false, error: 'No stored credentials available' };
        }

        console.log('Playwright: Attempting re-login with stored credentials...');

        // Close existing browser to start fresh
        await this.close();

        // Perform login with stored credentials
        const result = await this.login(this.storedUsername, this.storedPassword);

        return {
            success: result.success,
            cookies: result.cookies,
            error: result.error
        };
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
                                onclick: nameLink.getAttribute('onclick'),
                                professor: periodCell ?
                                    (row.querySelector('td.nome') as HTMLElement)?.innerText?.split('\n').pop()?.trim() || 'Professor não identificado'
                                    : 'Professor não identificado'
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

    async enterCourseDirect(courseId: string, courseName: string): Promise<{ success: boolean; html?: string; cookies?: any[]; error?: string }> {
        try {
            logger.info(`Playwright: Entering course ${courseName} (${courseId}) via Headless API...`);

            if (!this.context) {
                await this.getCourses(); // Ensure context exists
            }

            if (!this.context) {
                return { success: false, error: 'Failed to initialize browser context' };
            }

            // 1. Fetch Portal Page (API Request - Fast)
            const portalResponse = await this.context.request.get('https://si3.ufc.br/sigaa/verPortalDiscente.do');
            const portalHtml = await portalResponse.text();

            // 2. Parse Form Data
            const $ = cheerio.load(portalHtml);
            const idInput = $(`input[name="idTurma"][value="${courseId}"]`);

            if (idInput.length === 0) {
                return { success: false, error: 'Course ID input not found in portal' };
            }

            const form = idInput.closest('form');
            const formName = form.attr('name');
            const link = idInput.closest('tr').find('a[id*="turmaVirtual"]');
            const onclick = link.attr('onclick');

            if (!formName || !onclick) {
                return { success: false, error: 'Could not extract form parameters' };
            }

            // Extract JSF parameters
            const jsfMatch = onclick.match(/'([^']+)','([^']+)','([^']+)'/);
            if (!jsfMatch) {
                return { success: false, error: 'Could not parse JSF parameters' };
            }

            const [_, _formId, inputId, _value] = jsfMatch;

            // Prepare Form Data
            const formData: Record<string, string> = {};

            // Add all hidden inputs from the form
            form.find('input[type="hidden"]').each((_, el) => {
                const name = $(el).attr('name');
                const val = $(el).attr('value');
                if (name && val) formData[name] = val;
            });

            // Add JSF specific inputs
            formData[formName] = formName;
            formData['javax.faces.ViewState'] = $('input[name="javax.faces.ViewState"]').val() as string;
            formData[inputId] = inputId; // The button clicked
            formData['idTurma'] = courseId; // Explicitly ensure this is set

            // 3. Submit Form (API Request - Fast)
            const entryResponse = await this.context.request.post('https://si3.ufc.br/sigaa/verPortalDiscente.do', {
                form: formData,
                headers: {
                    'Referer': 'https://si3.ufc.br/sigaa/verPortalDiscente.do'
                }
            });

            const entryHtml = await entryResponse.text();

            if (entryHtml.includes('Menu Turma Virtual')) {
                logger.info('Playwright: Headless API Entry successful!');
                return {
                    success: true,
                    html: entryHtml,
                    cookies: await this.context.cookies()
                };
            } else {
                // Save debug HTML for failed navigations
                const debugPath = `debug_playwright_fail_${courseId}.html`;
                require('fs').writeFileSync(debugPath, entryHtml);
                logger.warn(`Playwright: Course page validation failed (no 'Menu Turma Virtual'). Saved to ${debugPath}`);
                return { success: false, error: 'Headless API Entry failed - did not reach Virtual Classroom' };
            }

        } catch (error: any) {
            logger.error('Playwright: Headless API Entry Error:', error);
            return { success: false, error: error.message };
        }
    }

    async enterCourseAndGetHTML(courseId: string, courseName: string): Promise<{ success: boolean; html?: string; cookies?: any[]; error?: string }> {
        try {
            if (!this.browser || !this.context) {
                // If browser is closed, relaunch it
                console.log('Playwright: Browser not active, relaunching...');
                await this.getCourses(); // This will relaunch and set this.context
            }

            // IMPORTANT: Reuse the existing page instead of creating a new one
            // Creating a new page causes "Acesso Negado" (Access Denied) errors
            // because the portal requires the same page/session state
            if (!this.page || this.page.isClosed()) {
                console.log('Playwright: No existing page, creating new one from context...');
                this.page = await this.context!.newPage();
            }

            const page = this.page;

            // Always force navigation to portal to ensure clean state
            console.log(`Playwright: Navigating to portal for ${courseName}...`);

            // Better navigation strategy: Go to Home -> Click Menu Discente
            // This mimics user behavior and avoids "Access Denied" errors
            try {
                await page.goto('https://si3.ufc.br/sigaa/paginaInicial.do');
                await page.waitForLoadState('networkidle');

                // Check if we were redirected to login
                if (page.url().includes('verTelaLogin') || page.url().includes('logar.do')) {
                    console.warn('Playwright: Redirected to login page. Session expired.');
                    // Don't close page - we might need to re-login and reuse it
                    this.page = null;
                    return { success: false, error: 'Session expired - please login again' };
                }

                // Click on "Menu Discente" link
                const studentLink = page.locator('a[href="/sigaa/verPortalDiscente.do"]').first();
                if (await studentLink.isVisible()) {
                    await studentLink.click();
                    await page.waitForLoadState('networkidle');
                } else {
                    // Fallback to direct navigation if link not found
                    console.log('Playwright: Menu Discente link not found, trying direct navigation...');
                    await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
                    await page.waitForLoadState('networkidle');
                }
            } catch (navError) {
                console.error('Playwright: Navigation error:', navError);
                // Last resort fallback
                await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
                await page.waitForLoadState('networkidle');
            }

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
                // Get debug info about what courses ARE on the portal
                const debugInfo = await page.evaluate(() => {
                    const inputs = Array.from(document.querySelectorAll('input[name="idTurma"]'));
                    return {
                        courseIds: inputs.map(input => (input as HTMLInputElement).value),
                        pageTitle: document.title,
                        bodyText: document.body.innerText.substring(0, 500)
                    };
                });

                console.error(`Playwright: Course ${courseId} not found in portal. Current URL: ${page.url()}`);
                console.error(`Playwright: Available course IDs: ${debugInfo.courseIds.join(', ')}`);
                console.error(`Playwright: Page title: ${debugInfo.pageTitle}`);

                // Save debug HTML
                const html = await page.content();
                try {
                    const debugPath = path.join(process.cwd(), `debug_portal_fail_${courseId}.html`);
                    fs.writeFileSync(debugPath, html);
                    console.log(`Playwright: Saved debug HTML to ${debugPath}`);
                } catch (e) {
                    console.error('Failed to save debug HTML:', e);
                }

                // Don't close page - keep it for potential retry
                return { success: false, error: `Course link not found in portal. Available IDs: ${debugInfo.courseIds.join(', ')}` };
            }

            if (entered.success) {
                logger.info('Playwright: Click processed, waiting for Course Page content...');
                try {
                    // Crucial: Wait for specific text that ONLY appears on the course page
                    await page.waitForSelector('text=Menu Turma Virtual', { timeout: 15000 });
                    logger.info('Playwright: Verified we are on Course Page (found "Menu Turma Virtual")');
                } catch (e) {
                    logger.warn('Playwright: Timeout waiting for "Menu Turma Virtual". Navigation may have failed or page is slow.');
                    // Don't throw - let it proceed to check URL/content below, but this warns us
                }

                await page.waitForLoadState('networkidle');
                // Wait slightly more for JSF to settle
                await page.waitForTimeout(2000);
            }

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

            // We check if the course name is present (Strict Check)
            // Removing substring limit to ensure we distinguish between "Course I" and "Course II"
            if (!normalizedContent.includes(normalizedName)) {
                const errorMsg = `Playwright: Course verification failed! Page does not contain "${courseName}". We might be on the wrong course page.`;
                console.error(errorMsg);
                throw new Error(errorMsg);
            } else {
                console.log(`Playwright: Verified we are in course "${courseName}"`);
            }


            // Verify we are on the course page
            try {
                await page.waitForSelector('text=Menu Turma Virtual', { timeout: 15000 });
                logger.info('Playwright: Verified we are on Course Page (found "Menu Turma Virtual")');
            } catch (e) {
                logger.warn('Playwright: Could not verify "Menu Turma Virtual". We might be on the portal or a different page.');
                const content = await page.content();
                if (content.includes('Portal do Discente')) {
                    throw new Error('Still on Portal Page after clicking course.');
                }
            }

            return {
                success: true,
                html: await page.content(),
                cookies: await this.context!.cookies()
            };

        } catch (error: any) {
            const html = this.page ? await this.page.content().catch(() => '') : '';
            if (html) {
                const debugPath = `debug_playwright_fail_${courseId}.html`;
                const debugFullPath = path.resolve(process.cwd(), debugPath);
                fs.writeFileSync(debugFullPath, html);
                logger.error(`Playwright: Navigation failed. Saved HTML to ${debugFullPath}`);
            }
            logger.error(`Playwright: Error entering course ${courseId}:`, error);
            // Don't close likely
            return { success: false, error: error.message };
        }
    }

    async navigateToFilesSection(): Promise<{ success: boolean; html?: string; error?: string }> {
        if (!this.browser || !this.page) {
            return { success: false, error: 'Browser not initialized' };
        }
        const page = this.page;

        try {
            logger.info('Playwright: Navigating to Files Section (Materiais > Conteúdo)...');

            // Find "Conteúdo" in the menu
            // We use 'text=Conteúdo' but scoped to .itemMenu for precision
            const success = await page.evaluate(async () => {
                const menuItems = Array.from(document.querySelectorAll('.itemMenu'));
                const contentItem = menuItems.find(item => item.textContent?.trim() === 'Conteúdo');
                if (contentItem) {
                    const link = contentItem.closest('a');
                    if (link) {
                        link.click();
                        return true;
                    }
                }
                return false;
            });

            if (!success) {
                // Try clicking "Materiais" first if it's an accordion
                logger.info('Playwright: "Conteúdo" not found directly, checking "Materiais"...');
                const materiaisVisible = await page.isVisible('text=Materiais');
                if (materiaisVisible) {
                    await page.click('text=Materiais');
                    await page.waitForTimeout(500);
                    // Try finding Conteúdo again
                    const successRetry = await page.evaluate(async () => {
                        const menuItems = Array.from(document.querySelectorAll('.itemMenu'));
                        const contentItem = menuItems.find(item => item.textContent?.trim() === 'Conteúdo');
                        if (contentItem) {
                            const link = contentItem.closest('a');
                            if (link) {
                                link.click();
                                return true;
                            }
                        }
                        return false;
                    });
                    if (!successRetry) {
                        throw new Error('Could not find "Conteúdo" link even after expanding Materiais');
                    }
                } else {
                    throw new Error('Could not find "Conteúdo" link');
                }
            }

            // Wait for load
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000); // Wait for JSF update

            return {
                success: true,
                html: await page.content()
            };

        } catch (error: any) {
            logger.error('Playwright: Error navigating to Files Section:', error);
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

    async getNewsDetail(courseId: string, courseName: string, newsId: string): Promise<{ success: boolean; news?: any; error?: string }> {
        try {
            console.log(`Playwright: Fetching news ${newsId} for course ${courseName}...`);

            if (!this.browser || !this.context || !this.page || this.page.isClosed()) {
                console.log('Playwright: Browser not active, relaunching...');
                await this.getCourses();
            }

            if (!this.page || this.page.isClosed()) {
                return { success: false, error: 'Failed to initialize browser page' };
            }

            const page = this.page;

            // 1. Navigate to course AVA page if not already there
            if (!page.url().includes('ava/index.jsf')) {
                console.log('Playwright: Navigating to AVA...');
                // We need to enter the course first
                const enterResult = await this.enterCourseAndGetHTML(courseId, courseName);
                if (!enterResult.success) {
                    return { success: false, error: enterResult.error };
                }
            }

            // 2. Find and click the news link
            // News links are inside forms that contain a hidden input with name="id" and value=newsId
            // Structure: <form><input name="id" value="newsId"><a href="#" onclick="...">(Visualizar)</a></form>
            console.log(`Playwright: Looking for news link with ID ${newsId}...`);

            let found = false;

            // Strategy 1: Find form with hidden input containing the news ID
            const formSelector = `form:has(input[name="id"][value="${newsId}"])`;
            const newsForm = await page.$(formSelector);

            if (newsForm) {
                console.log(`Playwright: Found form containing news ID ${newsId}`);
                const linkInForm = await newsForm.$('a');
                if (linkInForm) {
                    console.log(`Playwright: Clicking link inside form...`);
                    await linkInForm.click();
                    found = true;
                }
            }

            // Strategy 2: Fallback - look in page.evaluate for more complex DOM traversal
            if (!found) {
                console.log(`Playwright: Form selector failed, using page.evaluate...`);
                found = await page.evaluate((id) => {
                    const inputs = document.querySelectorAll('input[name="id"]');
                    for (const input of inputs) {
                        if ((input as HTMLInputElement).value === id) {
                            const form = input.closest('form');
                            if (form) {
                                const link = form.querySelector('a');
                                if (link) {
                                    (link as HTMLAnchorElement).click();
                                    return true;
                                }
                            }
                        }
                    }
                    return false;
                }, newsId);
            }

            if (!found) {
                // Save debug HTML
                const html = await page.content();
                const debugPath = path.join(process.cwd(), `debug_playwright_news_fail_${newsId}.html`);
                fs.writeFileSync(debugPath, html);
                console.log(`Playwright: Saved debug HTML to ${debugPath}`);
                return { success: false, error: `News link with ID ${newsId} not found` };
            }

            console.log(`Playwright: Successfully clicked news link for ${newsId}`);

            // 3. Wait for page to load
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            // DEBUG: Save news detail page HTML
            const newsDetailHtml = await page.content();
            const debugNewsPath = path.join(process.cwd(), `debug_news_detail_${newsId}.html`);
            fs.writeFileSync(debugNewsPath, newsDetailHtml);
            console.log(`Playwright: Saved news detail page to ${debugNewsPath}`);

            // 4. Parse the news content
            const newsData = await page.evaluate(() => {
                const getText = (label: string): string => {
                    const allElements = document.querySelectorAll('td, th, span, label, strong, b, div');
                    for (const el of allElements) {
                        const text = el.textContent?.trim().replace(':', '');
                        if (text === label) {
                            // Try sibling
                            const next = el.nextElementSibling;
                            if (next) return next.textContent?.trim() || '';
                            // Try parent's sibling (table row)
                            const parentTd = el.closest('td');
                            if (parentTd && parentTd.nextElementSibling) {
                                return parentTd.nextElementSibling.textContent?.trim() || '';
                            }
                        }
                    }
                    return '';
                };

                const getContent = (): string => {
                    // Strategy 1: Look for "Texto" label in th/td structure
                    // Structure: <th><b>Texto:</b></th><td>...content...</td>
                    const thElements = document.querySelectorAll('th');
                    for (const th of thElements) {
                        if (th.textContent?.trim().replace(':', '').toLowerCase() === 'texto') {
                            // Get the next sibling td
                            const nextTd = th.nextElementSibling;
                            if (nextTd && nextTd.tagName === 'TD') {
                                // Get the content and clean it up
                                let html = nextTd.innerHTML;
                                // Remove excessive whitespace
                                html = html.replace(/\s+/g, ' ').trim();
                                return html;
                            }
                        }
                    }

                    // Strategy 2: Look for td/label pairs
                    const allElements = document.querySelectorAll('td, th, span, label, strong, b, div');
                    for (const el of allElements) {
                        const text = el.textContent?.trim().replace(':', '');
                        if (text === 'Texto') {
                            const parentTd = el.closest('td') || el.closest('th');
                            if (parentTd && parentTd.nextElementSibling) {
                                return parentTd.nextElementSibling.innerHTML || '';
                            }
                        }
                    }

                    // Strategy 3: Look for content in specific SIGAA containers
                    const contentContainers = [
                        '.conteudo-noticia',
                        '#conteudo-noticia',
                        '.texto-noticia',
                        '.noticia-texto',
                        'div[class*="noticia"]',
                        '.msgBody',
                        '#msgBody'
                    ];

                    for (const selector of contentContainers) {
                        const container = document.querySelector(selector);
                        if (container && container.innerHTML.trim()) {
                            return container.innerHTML;
                        }
                    }

                    // Strategy 4: Look for the largest content block on the page
                    const mainContent = document.getElementById('conteudo');
                    if (mainContent) {
                        // Find the deepest div with significant text content
                        const divs = mainContent.querySelectorAll('div, td');
                        let bestContent = '';
                        let maxLength = 0;

                        for (const div of divs) {
                            const text = div.textContent?.trim() || '';
                            // Skip if it contains labels like "Título", "Data", etc.
                            if (text.length > maxLength &&
                                !text.startsWith('Título') &&
                                !text.startsWith('Data') &&
                                !text.startsWith('Notificação') &&
                                text.length > 20) {
                                maxLength = text.length;
                                bestContent = div.innerHTML;
                            }
                        }

                        if (bestContent) return bestContent;
                    }

                    return '';
                };

                return {
                    title: getText('Título') || getText('Assunto'),
                    date: getText('Data') || getText('Data de Cadastro'),
                    content: getContent(),
                    notification: getText('Notificação')
                };
            });

            console.log(`Playwright: Parsed news - Title: "${newsData.title}", ContentLength: ${newsData.content.length}`);

            // 5. Navigate back to AVA if needed (for subsequent operations)
            // Not strictly necessary but keeps state clean
            // await page.goBack();

            if (!newsData.content && !newsData.title) {
                // Save debug HTML
                const html = await page.content();
                const debugPath = path.join(process.cwd(), `debug_playwright_news_${newsId}.html`);
                fs.writeFileSync(debugPath, html);
                console.log(`Playwright: Saved debug HTML to ${debugPath}`);
                return { success: false, error: 'Could not parse news content from page' };
            }

            return { success: true, news: newsData };

        } catch (error: any) {
            console.error('Playwright: Error fetching news:', error);
            return { success: false, error: error.message };
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
