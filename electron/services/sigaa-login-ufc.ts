import { URL } from 'url';

// Using 'any' for types that are not exported by sigaa-api
export class SigaaLoginUFC {
    constructor(protected http: any, protected session: any) { }

    async login(username: string, password: string): Promise<any> {
        if (this.session.loginStatus === 1) { // LoginStatus.Authenticated
            throw new Error('SIGAA: This session already has a user logged in.');
        }

        // 1. Get Login Page
        const loginPage = await this.http.get('/sigaa/verTelaLogin.do');

        // 2. Parse Form Dynamically
        const $ = loginPage.$;
        const form = $('form[name="loginForm"]');

        if (form.length === 0) {
            console.warn('SIGAA: Login form not found in response, attempting hardcoded fallback.');
        }

        let actionUrl = '/sigaa/logar.do?dispatch=logOn';
        const postValues: Record<string, string> = {};

        if (form.length > 0) {
            const parsedAction = form.attr('action');
            if (parsedAction) {
                actionUrl = parsedAction;
            }

            // Extract all inputs
            form.find('input').each((_: any, element: any) => {
                const name = $(element).attr('name');
                const value = $(element).val();
                if (name) {
                    postValues[name] = value || '';
                }
            });
        } else {
            // Hardcoded fallback
            postValues['width'] = '0';
            postValues['height'] = '0';
            postValues['urlRedirect'] = '';
            postValues['acao'] = '';
        }

        // 3. Set Credentials and Required Fields
        postValues['user.login'] = username;
        postValues['user.senha'] = password;
        postValues['width'] = '1920';
        postValues['height'] = '1080';
        postValues['entrar'] = 'Entrar'; // Important: Submit button name/value

        console.log('SIGAA: Attempting login to', actionUrl);
        console.log('SIGAA: Form values:', JSON.stringify(postValues, null, 2));

        // 4. Submit Login
        // Try to set Referer to mimic browser behavior
        const options = {
            headers: {
                'Referer': loginPage.url.href,
                'Origin': new URL(loginPage.url.href).origin
            }
        };

        const resultPage = await this.http.post(actionUrl, postValues, options);

        // 5. Verify Result
        const finalPage = await this.http.followAllRedirect(resultPage);
        const body = finalPage.bodyDecoded;

        // Check for login page indicators
        if (body.includes('Entrar no Sistema') || body.includes('name="loginForm"')) {
            if (body.includes('Usuário e/ou senha inválidos') || body.includes('Dados inválidos')) {
                throw new Error('SIGAA: Invalid credentials.');
            }

            // Log a snippet of the body for debugging
            const snippet = body.substring(body.indexOf('<body'), body.indexOf('<body') + 500).replace(/\s+/g, ' ');
            console.error('SIGAA: Login failed. Body snippet:', snippet);

            throw new Error('SIGAA: Invalid response after login attempt (Still on login page).');
        }

        // Success
        this.session.loginStatus = 1; // LoginStatus.Authenticated
        return finalPage;
    }
}
