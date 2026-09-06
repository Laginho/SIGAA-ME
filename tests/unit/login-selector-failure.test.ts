// @vitest-environment jsdom
/**
 * Renderer-to-main-process boundary test. It verifies that a backend selector
 * drift error is visible to the user and leaves the Electron renderer usable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
});

import { renderLoginPage } from '../../src/pages/login';
import { getActiveAccount } from '../../src/data/account-storage';

async function flushLoginRequest() {
    await Promise.resolve();
    await Promise.resolve();
}

describe('Login selector-drift recovery (renderer E2E boundary)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        sessionStorage.clear();
        window.location.hash = '';
        (window as any).api = {
            login: vi.fn().mockResolvedValue({
                success: false,
                error: { code: 'SELECTOR_DRIFT', message: 'SIGAA login selector drift: the username field (input[name="user.login"]) was not found.' }
            })
        };
    });

    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('shows the actionable backend error, restores the submit button, and does not create a session account', async () => {
        const app = document.createElement('div');
        document.body.appendChild(app);
        renderLoginPage(app);

        (document.getElementById('username') as HTMLInputElement).value = 'student';
        (document.getElementById('password') as HTMLInputElement).value = 'password';
        document.getElementById('loginForm')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flushLoginRequest();

        expect((window as any).api.login).toHaveBeenCalledWith({ username: 'student', password: 'password', rememberMe: false });
        expect(document.querySelector('.toast--error')?.textContent).toContain('SIGAA login selector drift');
        expect((document.getElementById('loginBtn') as HTMLButtonElement).disabled).toBe(false);
        expect((document.getElementById('loginBtn') as HTMLButtonElement).textContent).toBe('Entrar');
        expect(getActiveAccount()).toBeNull();
        expect(window.location.hash).toBe('');
    });
});
