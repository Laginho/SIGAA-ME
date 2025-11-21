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

            // Navigate to the student portal page
            await page.goto('https://si3.ufc.br/sigaa/portais/discente/discente.jsf');
            await page.waitForLoadState('networkidle');

            // Extract user name from the page using the correct selector
            const nameElement = await page.$('.nome_usuario');
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

            // Navigate to the student courses page
            console.log('Playwright: Navigating to courses page...');
            await page.goto('https://si3.ufc.br/sigaa/portais/discente/discente.jsf');
            await page.waitForLoadState('networkidle');

            // Check if we need to login (if cookies expired)
            if (page.url().includes('verTelaLogin')) {
                await this.close();
                return { success: false, error: 'Session expired - please login again' };
            }

            // Extract courses from the page
            console.log('Playwright: Extracting courses from page...');
            const courses = await page.$$eval('table[class*="listing"] tr', (rows: any) => {
                // Skip header row
                return rows.slice(1).map((row: any) => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        return {
                            name: cells[0]?.textContent?.trim() || '',
                            code: cells[1]?.textContent?.trim() || '',
                            period: cells[2].textContent?.trim() || ''
                        };
                    }
                    return null;
                }).filter((course: any) => course !== null && course.name);
            });

            console.log('Playwright: Found courses:', courses.length);

            await this.close();
            return { success: true, courses };

        } catch (error: any) {
            console.error('Playwright: Error fetching courses:', error);
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
