import { Sigaa } from 'sigaa-api';

// This class will handle all the logic for talking to SIGAA.
// We keep it here in the "Backend" (Electron Main Process) so it's secure.
export class SigaaService {
    private sigaa: Sigaa;

    constructor() {
        this.sigaa = new Sigaa({
            url: 'https://sigaa.ifsc.edu.br' // We might need to make this configurable later!
        });
    }

    async login(username: string, password: string): Promise<{ success: boolean; message?: string }> {
        try {
            const account = await this.sigaa.login(username, password);
            if (account) {
                return { success: true };
            } else {
                return { success: false, message: 'Authentication failed.' };
            }
        } catch (error: any) {
            console.error('Login error:', error);
            return { success: false, message: error.message || 'Unknown error occurred.' };
        }
    }
}
