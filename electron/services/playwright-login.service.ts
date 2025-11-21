import { chromium, Browser } from 'playwright';

/**
 * Uses Playwright to automate a real browser for UFC SIGAA login.
 * This handles all the complexity that the HTTP approach couldn't solve.
 */
export class PlaywrightLoginService {
    private browser: Browser | null = null;

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

    async close() {
        if (this.browser) {
            console.log('Playwright: Closing browser...');
            await this.browser.close();
            this.browser = null;
        }
    }
}
