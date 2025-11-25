import { chromium, Browser } from 'playwright';

/**
 * Uses Playwright to automate a real browser for UFC SIGAA login.
 * This handles all the complexity that the HTTP approach couldn't solve.
 */
export class PlaywrightLoginService {
    private browser: Browser | null = null;
    private storedCookies: any[] = [];

    async login(username: string, password: string): Promise<{ success: boolean; cookies?: any[]; userName?: string; error?: string }> {
        try {
            console.log('Playwright: Launching browser...');

            this.browser = await chromium.launch({
                headless: true
            });

            const context = await this.browser.newContext();
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

            await this.close();

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

    async getCourses(): Promise<{ success: boolean; courses?: any[]; error?: string }> {
        try {
            console.log('Playwright: Launching browser to fetch courses...');

            // Check if we have stored cookies
            if (!this.storedCookies || this.storedCookies.length === 0) {
                return { success: false, error: 'No stored session - please login first' };
            }

            this.browser = await chromium.launch({
                headless: true
            });

            const context = await this.browser.newContext();

            // Inject stored cookies
            console.log('Playwright: Injecting stored session cookies...');
            await context.addCookies(this.storedCookies);

            const page = await context.newPage();

            // Enable console logs from the browser to Node.js
            page.on('console', msg => console.log('Playwright Browser Log:', msg.text()));

            // Start at home page
            console.log('Playwright: Navigating to home page...');
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

                        // Course codes follow pattern: 2 letters + 4 digits (e.g., CB0699, CK0181)
                        // Format usually: "CODE - NAME"
                        const parts = fullText.split(' - ');

                        if (parts.length >= 2) {
                            results.push({
                                id: id,
                                code: parts[0].trim(),
                                name: parts.slice(1).join(' - ').trim(),
                                period: periodCell ? (periodCell as HTMLElement).innerText.split('\n')[0] : '' // Try to get first line of period info
                            });
                        }
                    }
                }

                return results;
            });

            console.log('Playwright: Found courses:', courses.length);
            if (courses.length > 0) {
                console.log('Playwright: Sample courses:', courses.slice(0, 3));
            }

            await this.close();
            return { success: true, courses };

        } catch (error: any) {
            console.error('Playwright: Error fetching courses:', error);
            await this.close();
            return { success: false, error: error.message };
        }
    }

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

    async getCourseFiles(courseId: string, courseName?: string): Promise<{ success: boolean; files?: any[]; news?: any[]; error?: string }> {
        try {
            console.log(`Playwright: Fetching files for course ${courseName || courseId}...`);

            if (!this.storedCookies || this.storedCookies.length === 0) {
                return { success: false, error: 'No stored session - please login first' };
            }

            this.browser = await chromium.launch({
                headless: true
            });

            const context = await this.browser.newContext();
            await context.addCookies(this.storedCookies);
            const page = await context.newPage();

            // Navigate to course page
            const navigated = await this.navigateToCourse(page, courseId);
            if (!navigated) {
                await this.close();
                return { success: false, error: 'Failed to navigate to course page' };
            }

            console.log('Playwright: Extracting files...');

            // Extract files and news directly from main page
            const data = await page.evaluate(() => {
                const files: any[] = [];
                const news: any[] = [];

                // --- SCRAPE FILES ---
                const links = Array.from(document.querySelectorAll('a'));

                for (const link of links) {
                    const text = link.innerText.trim();
                    let href = link.href;
                    const onclick = link.getAttribute('onclick');

                    // Files usually have .pdf, .doc, etc. extensions in the text
                    if (text && (
                        text.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i) ||
                        text.toLowerCase().includes('lista') ||
                        text.toLowerCase().includes('exerc')
                    )) {
                        // If href is just '#', try to extract from onclick
                        if (href.endsWith('#') || href.includes('index.jsf#')) {
                            if (onclick) {
                                // Extract URL from onclick
                                const urlMatch = onclick.match(/['"]([^'"]*downloadArquivo[^'"]*)['"]/i) ||
                                    onclick.match(/['"]([^'"]*visualizar[^'"]*)['"]/i) ||
                                    onclick.match(/['"]([^'"]*\.(pdf|doc|docx)[^'"]*)['"]/i);
                                if (urlMatch) {
                                    href = urlMatch[1];
                                    if (!href.startsWith('http')) {
                                        href = 'https://si3.ufc.br' + (href.startsWith('/') ? href : '/sigaa/' + href);
                                    }
                                }
                            }
                        }

                        files.push({
                            name: text,
                            url: href
                        });
                    }
                }

                // --- SCRAPE NEWS ---
                // Strategy 1: Look for the news table by headers
                const tables = Array.from(document.querySelectorAll('table'));
                console.log(`[Scraper] Found ${tables.length} tables on the page.`);

                for (const table of tables) {
                    const headers = Array.from(table.querySelectorAll('th, td')).map(cell => (cell as HTMLElement).innerText.trim());
                    console.log(`[Scraper] Table headers: ${headers.join(', ')}`);

                    // Check if this table looks like a news table (case insensitive)
                    const hasTitle = headers.some(h => /t[ií]tulo|assunto/i.test(h));
                    const hasDate = headers.some(h => /data/i.test(h));

                    if (hasTitle && hasDate) {
                        console.log('[Scraper] Found potential news table!');
                        const rows = Array.from(table.querySelectorAll('tr'));

                        for (const row of rows) {
                            // Skip header rows
                            if (row.querySelector('th')) continue;

                            const cells = Array.from(row.querySelectorAll('td'));
                            if (cells.length >= 2) {
                                const title = cells[0]?.innerText.trim();
                                const date = cells[1]?.innerText.trim();
                                const notification = cells[2]?.innerText.trim();

                                if (!title || !date) continue;

                                const viewLink = row.querySelector('a[onclick*="visualizarNoticia"]');
                                let id = '';

                                if (viewLink) {
                                    const onclick = viewLink.getAttribute('onclick');
                                    const match = onclick?.match(/visualizarNoticia\s*\(\s*['"]([^'"]+)['"]/);
                                    if (match) {
                                        id = match[1];
                                    }
                                }

                                if (id) {
                                    news.push({ title, date, notification, id });
                                }
                            }
                        }
                    }
                }

                // Strategy 2: Fallback - Look for any link with 'visualizarNoticia'
                if (news.length === 0) {
                    console.log('[Scraper] No news found via table headers. Trying fallback strategy...');
                    const newsLinks = Array.from(document.querySelectorAll('a[onclick*="visualizarNoticia"]'));

                    for (const link of newsLinks) {
                        const onclick = link.getAttribute('onclick');
                        const match = onclick?.match(/visualizarNoticia\s*\(\s*['"]([^'"]+)['"]/);
                        if (!match) continue;

                        const id = match[1];
                        // Avoid duplicates
                        if (news.some(n => n.id === id)) continue;

                        const row = link.closest('tr');
                        if (row) {
                            const cells = Array.from(row.querySelectorAll('td'));
                            // Assume standard layout: Title (0), Date (1)
                            if (cells.length >= 2) {
                                const title = cells[0]?.innerText.trim();
                                const date = cells[1]?.innerText.trim();
                                const notification = cells[2]?.innerText.trim();

                                if (title && date) {
                                    console.log(`[Scraper] Found news via fallback: ${title}`);
                                    news.push({ title, date, notification, id });
                                }
                            }
                        }
                    }
                }

                return { files, news };
            });

            console.log('Playwright: Found', data.files.length, 'files and', data.news.length, 'news items');
            await this.close();
            return { success: true, files: data.files, news: data.news };

        } catch (error: any) {
            console.error('Playwright: Error fetching files:', error);
            await this.close();
            return { success: false, error: error.message };
        }
    }

    async downloadFile(
        courseId: string,
        courseName: string,
        fileName: string,
        fileUrl: string,
        basePath: string,
        downloadedFiles: Record<string, any>
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            const { DownloadService } = await import('./download.service');
            const downloadService = new DownloadService(this.browser);

            // Reinitialize browser for download
            if (!this.browser) {
                this.browser = await chromium.launch({ headless: false });
            }

            const context = await this.browser.newContext();
            // Inject stored cookies
            if (this.storedCookies.length > 0) {
                await context.addCookies(this.storedCookies);
            }

            const page = await context.newPage();

            // Navigate to course page first
            const navigated = await this.navigateToCourse(page, courseId);
            if (!navigated) {
                await this.close();
                return { success: false, error: 'Failed to navigate to course page' };
            }

            const result = await downloadService.downloadFile(
                page,
                fileUrl,
                fileName,
                courseName,
                basePath
            );

            await this.close();
            return result;
        } catch (error: any) {
            console.error('Playwright: Download error:', error);
            await this.close();
            return { success: false, error: error.message };
        }
    }

    async downloadAllFiles(
        courseId: string,
        courseName: string,
        files: Array<{ name: string; url: string }>,
        basePath: string,
        downloadedFiles: Record<string, any>,
        onProgress?: (fileName: string, status: 'downloaded' | 'skipped' | 'failed') => void
    ): Promise<{
        downloaded: number;
        skipped: number;
        failed: number;
        results: any[];
    }> {
        try {
            const { DownloadService } = await import('./download.service');
            const downloadService = new DownloadService(this.browser);

            // Reinitialize browser for download
            if (!this.browser) {
                this.browser = await chromium.launch({ headless: false });
            }

            const context = await this.browser.newContext();
            // Inject stored cookies
            if (this.storedCookies.length > 0) {
                await context.addCookies(this.storedCookies);
            }

            const page = await context.newPage();

            // Navigate to course page first
            const navigated = await this.navigateToCourse(page, courseId);
            if (!navigated) {
                await this.close();
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

            await this.close();
            return result;
        } catch (error: any) {
            console.error('Playwright: Download all error:', error);
            await this.close();
            return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
        }
    }

    async getNewsDetail(courseId: string, newsId: string): Promise<{ success: boolean; news?: any; error?: string }> {
        try {
            console.log(`Playwright: Fetching news detail ${newsId} for course ${courseId}...`);

            if (!this.storedCookies || this.storedCookies.length === 0) {
                return { success: false, error: 'No stored session - please login first' };
            }

            this.browser = await chromium.launch({
                headless: true
            });

            const context = await this.browser.newContext();
            await context.addCookies(this.storedCookies);
            const page = await context.newPage();

            // Navigate to course page
            const navigated = await this.navigateToCourse(page, courseId);
            if (!navigated) {
                await this.close();
                return { success: false, error: 'Failed to navigate to course page' };
            }

            console.log('Playwright: Clicking news link...');

            // Find the link that calls visualizing news with this ID
            // The ID we extracted was from onclick="...:visualizarNoticia('ID')..."
            // So we look for an element with that in onclick

            // We need to use evaluate to find and click because the ID might be part of a larger string
            const clicked = await page.evaluate((id) => {
                const links = Array.from(document.querySelectorAll('a'));
                const targetLink = links.find(a => {
                    const onclick = a.getAttribute('onclick');
                    return onclick && onclick.includes(`visualizarNoticia`) && onclick.includes(`'${id}'`);
                });

                if (targetLink) {
                    targetLink.click();
                    return true;
                }
                return false;
            }, newsId);

            if (!clicked) {
                await this.close();
                return { success: false, error: 'News link not found' };
            }

            await page.waitForLoadState('networkidle');

            // Now scrape the detail page
            console.log('Playwright: Scraping news details...');
            const newsDetail = await page.evaluate(() => {
                // Based on the user image:
                // Header: Visualização de Notícia
                // Fields: Título, Data, Texto, Notificação

                // Usually these are in a form or a specific container
                // Let's try to find by labels

                const getTextAfterLabel = (label: string) => {
                    // Find an element containing the label
                    const elements = Array.from(document.querySelectorAll('td, th, label, span, div'));
                    const labelEl = elements.find(el => (el as HTMLElement).innerText.trim().replace(':', '') === label);

                    if (labelEl) {
                        // Try next sibling or parent's next sibling
                        // In SIGAA, it's often: <td><label>Title:</label></td><td>Value</td>
                        // Or <label>Title:</label> <span>Value</span>

                        // Case 1: Table cell
                        const parentTd = labelEl.closest('td');
                        if (parentTd && parentTd.nextElementSibling) {
                            return (parentTd.nextElementSibling as HTMLElement).innerText.trim();
                        }

                        // Case 2: Direct sibling
                        if (labelEl.nextElementSibling) {
                            return (labelEl.nextElementSibling as HTMLElement).innerText.trim();
                        }
                    }
                    return '';
                };

                // Specific scraping for the "Texto" (Content) which might be a larger block
                const getContent = () => {
                    // Look for the label "Texto:"
                    const elements = Array.from(document.querySelectorAll('td, th, label, span, div'));
                    const labelEl = elements.find(el => (el as HTMLElement).innerText.trim().replace(':', '') === 'Texto');

                    if (labelEl) {
                        const parentTd = labelEl.closest('td');
                        if (parentTd && parentTd.nextElementSibling) {
                            return (parentTd.nextElementSibling as HTMLElement).innerHTML; // Keep HTML for formatting
                        }
                    }
                    return '';
                };

                return {
                    title: getTextAfterLabel('Título'),
                    date: getTextAfterLabel('Data'),
                    content: getContent(),
                    notification: getTextAfterLabel('Notificação')
                };
            });

            console.log('Playwright: Scraped news detail:', newsDetail.title);

            await this.close();
            return { success: true, news: newsDetail };

        } catch (error: any) {
            console.error('Playwright: Error fetching news detail:', error);
            await this.close();
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
}
