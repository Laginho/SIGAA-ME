import { Sigaa } from 'sigaa-api';
import { PlaywrightLoginService } from './playwright-login.service';

// This class will handle all the logic for talking to SIGAA.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private sigaa: Sigaa;
    private playwrightLogin: PlaywrightLoginService;

    constructor() {
        // Initialize Sigaa instance (kept for potential future use)
        this.sigaa = new Sigaa({
            url: 'https://si3.ufc.br'
        });

        // Initialize Playwright login service
        this.playwrightLogin = new PlaywrightLoginService();

        console.log('SIGAA: Service initialized with Playwright');
    }

    async login(username: string, password: string): Promise<{ success: boolean; message?: string; account?: { name: string; photoUrl?: string } }> {
        try {
            // Use Playwright to login and get user data
            console.log('SIGAA: Starting Playwright login...');
            const result = await this.playwrightLogin.login(username, password);

            if (!result.success) {
                return { success: false, message: result.error || 'Login failed' };
            }

            console.log('SIGAA: Login successful!');

            // Return the user data extracted by Playwright
            return {
                success: true,
                account: {
                    name: result.userName || 'User',
                    photoUrl: undefined // We can extract this later if needed
                }
            };
        } catch (error: any) {
            console.error('Login error:', error);
            return { success: false, message: error.message || 'Unknown error occurred.' };
        }
    }

    async getCourses(): Promise<{ success: boolean; courses?: any[]; message?: string }> {
        try {
            console.log('SIGAA: Fetching courses using Playwright...');

            // Use Playwright to scrape courses from the page
            const result = await this.playwrightLogin.getCourses();

            if (!result.success) {
                return { success: false, message: result.error || 'Failed to fetch courses' };
            }

            console.log('SIGAA: Found courses:', result.courses?.length || 0);

            return {
                success: true,
                courses: result.courses
            };
        } catch (error: any) {
            console.error('SIGAA: Error fetching courses:', error);
            return { success: false, message: error.message || 'Failed to fetch courses' };
        }
    }
}
