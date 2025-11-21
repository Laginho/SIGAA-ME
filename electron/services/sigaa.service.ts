import { Sigaa } from 'sigaa-api';

import { SigaaLoginUFC } from './sigaa-login-ufc';

// This class will handle all the logic for talking to SIGAA.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private sigaa: Sigaa;

    constructor() {
        this.sigaa = new Sigaa({
            url: 'https://si3.ufc.br'
        });

        // Inject custom UFC Login Handler
        const http = (this.sigaa as any).http;
        const session = this.sigaa.session;
        (this.sigaa as any).loginInstance = new SigaaLoginUFC(http, session);
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
