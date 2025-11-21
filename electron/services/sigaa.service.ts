import { Sigaa } from 'sigaa-api';
import { PlaywrightLoginService } from './playwright-login.service';

// This class will handle all the logic for talking to SIGAA.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private sigaa: Sigaa;
    private playwrightLogin: PlaywrightLoginService;

    constructor() {
        // Initialize Sigaa instance
        this.sigaa = new Sigaa({
            url: 'https://si3.ufc.br'
        });

        // Initialize Playwright login service
        this.playwrightLogin = new PlaywrightLoginService();

        console.log('SIGAA: Service initialized with Playwright login');
    }

    async login(username: string, password: string): Promise<{ success: boolean; message?: string; account?: { name: string; photoUrl?: string } }> {
        try {
            // Step 1: Use Playwright to login and get cookies
            console.log('SIGAA: Starting Playwright login...');
            const result = await this.playwrightLogin.login(username, password);

            if (!result.success) {
                return { success: false, message: result.error || 'Login failed' };
            }

            // Step 2: Extract JSESSIONID cookie
            const jsessionCookie = result.cookies?.find(c => c.name === 'JSESSIONID');
            if (!jsessionCookie) {
                return { success: false, message: 'Session cookie not found after login' };
            }

            console.log('SIGAA: Got session cookie:', jsessionCookie.value);

            // Step 3: Inject the cookie into sigaa-api's session
            // The session object should have a cookie jar we can manipulate
            const session = this.sigaa.session;
            const cookieJar = (session as any).cookies;

            if (cookieJar && cookieJar.setCookie) {
                // Create cookie string in the format the library expects
                const cookieString = `${jsessionCookie.name}=${jsessionCookie.value}; Domain=${jsessionCookie.domain}; Path=${jsessionCookie.path}`;
                await cookieJar.setCookie(cookieString, 'https://si3.ufc.br');
                console.log('SIGAA: Injected session cookie into sigaa-api');
            }

            // Step 4: Mark session as authenticated
            (session as any).loginStatus = 1; // LoginStatus.Authenticated

            // Step 5: Get account info using sigaa-api
            // We need to fetch the account page to create the Account object
            const http = (this.sigaa as any).http;
            const accountPage = await http.get('/sigaa/portais/discente/discente.jsf');

            // Use the account factory to create an Account object
            const accountFactory = (this.sigaa as any).accountFactory;
            const account = accountFactory.getAccount(accountPage);

            if (account) {
                // Get basic user info
                const name = await account.getName();
                const photoUrl = await account.getProfilePictureURL();

                return {
                    success: true,
                    account: {
                        name,
                        photoUrl: photoUrl ? photoUrl.toString() : undefined
                    }
                };
            } else {
                return { success: false, message: 'Could not create account object' };
            }
        } catch (error: any) {
            console.error('Login error:', error);
            return { success: false, message: error.message || 'Unknown error occurred.' };
        }
    }
}
