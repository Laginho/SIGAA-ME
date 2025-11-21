import { Sigaa } from 'sigaa-api';
import { SigaaLoginUFC } from './sigaa-login-ufc';
import { DummyLogin } from './dummy-login';

// This class will handle all the logic for talking to SIGAA.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private sigaa: Sigaa;

    constructor() {
        // 1. Initialize Sigaa with a DUMMY login handler.
        // This prevents the library from loading the default IFSC handler and throwing errors.
        this.sigaa = new Sigaa({
            url: 'https://si3.ufc.br',
            login: new DummyLogin() as any // Cast to any to satisfy interface if needed
        });

        // 2. Create our REAL custom UFC login handler
        // We extract the http and session objects from the initialized Sigaa instance
        const http = (this.sigaa as any).http;
        const session = this.sigaa.session;
        const ufcLogin = new SigaaLoginUFC(http, session);

        // 3. OVERRIDE the login method to use our custom handler
        this.sigaa.login = async (username: string, password: string) => {
            console.log('SIGAA: Starting custom UFC login flow...');

            // Call our UFC login handler directly
            const page = await ufcLogin.login(username, password);

            // Convert the result page to an Account object using the library's factory
            const accountFactory = (this.sigaa as any).accountFactory;
            return accountFactory.getAccount(page);
        };

        console.log('SIGAA: Service initialized with custom UFC login override.');
    }

    async login(username: string, password: string): Promise<{ success: boolean; message?: string; account?: { name: string; photoUrl?: string } }> {
        try {
            const account = await this.sigaa.login(username, password);
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
                return { success: false, message: 'Authentication failed.' };
            }
        } catch (error: any) {
            console.error('Login error:', error);
            return { success: false, message: error.message || 'Unknown error occurred.' };
        }
    }
}
