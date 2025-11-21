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

            // Launch browser in visible mode for debugging
            this.browser = await chromium.launch({
                headless: false, // Set to true later for production
                slowMo: 500 // Slow down actions so you can see what's happening
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
                headless: false,
                slowMo: 500
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
                                period: periodCell ? periodCell.innerText.split('\n')[0] : '' // Try to get first line of period info
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

    async getCourseFiles(courseId: string): Promise<{ success: boolean; files?: any[]; error?: string }> {
        try {
            console.log(`Playwright: Fetching files for course ${courseId}...`);

            if (!this.storedCookies || this.storedCookies.length === 0) {
                return { success: false, error: 'No stored session - please login first' };
            }

            this.browser = await chromium.launch({
                headless: false,
                slowMo: 500
            });

            const context = await this.browser.newContext();
            await context.addCookies(this.storedCookies);
            const page = await context.newPage();

            // Enable console logs
            page.on('console', msg => console.log('Playwright Browser Log:', msg.text()));

            // Go to portal
            await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
            await page.waitForLoadState('networkidle');

            // Enter the course
            console.log(`Playwright: Entering course ${courseId}...`);
            const entered = await page.evaluate((id) => {
                // Find the form/row with the matching idTurma
                const inputs = Array.from(document.querySelectorAll('input[name="idTurma"]'));
                const targetInput = inputs.find(input => (input as HTMLInputElement).value === id);

                if (targetInput) {
                    const row = targetInput.closest('tr');
                    if (row) {
                        const link = row.querySelector('a[id*="turmaVirtual"]') as HTMLElement;
                        if (link) {
                            link.click();
                            return true;
                        }
                    }
                }
                return false;
            }, courseId);

            if (!entered) {
                await this.close();
                return { success: false, error: 'Course not found' };
            }

            await page.waitForLoadState('networkidle');
            console.log('Playwright: Successfully entered course!');

            // Wait a bit for page to settle
            await page.waitForTimeout(1000);

            // DEBUG: Inspect page structure to find files
            console.log('Playwright: Inspecting course page structure...');
            const pageInfo = await page.evaluate(() => {
                // Get all section headers
                const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, .titulo')).map(h => h.textContent?.trim());

                // Get all links that might be relevant
                const links = Array.from(document.querySelectorAll('a')).map(a => ({
                    text: a.innerText.trim(),
                    href: a.href,
                    onclick: a.getAttribute('onclick'),
                    id: a.id
                })).filter(l => l.text.length > 0); // Only visible links

                return { headers, links };
            });

            console.log('Playwright: Page Headers:', pageInfo.headers);
            console.log('Playwright: All Links (first 20):', pageInfo.links.slice(0, 20));

            // Check specifically for "Materiais" or "Arquivos"
            const fileSection = pageInfo.links.filter(l =>
                l.text.match(/Arquivo|Material|Texto|Download|Baixar/i) ||
                (l.onclick && l.onclick.match(/Arquivo|Material/i))
            );
            console.log('Playwright: Potential File/Material Links:', fileSection);

            await this.close();
            return { success: true, files: [] }; // Still empty for now

        } catch (error: any) {
            console.error('Playwright: Error fetching files:', error);
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
