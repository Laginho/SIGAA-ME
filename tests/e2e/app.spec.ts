import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const SIGAA_USER = process.env.SIGAA_USER;
const SIGAA_PASS = process.env.SIGAA_PASS;
const hasCredentials = !!SIGAA_USER && !!SIGAA_PASS && SIGAA_USER !== 'your_sigaa_username';

const describeOrSkip = hasCredentials ? test.describe : test.describe.skip;

test.describe('App E2E', () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeAll(async () => {
        // Build electron app to ensure dist-electron and dist are ready
        // (Assuming the user runs `npm run build` or we test against the dev build)
        // For local tests, connecting to `.` picks up the package.json "main"
        electronApp = await electron.launch({ args: ['.'] });
        window = await electronApp.firstWindow();
    });

    test.afterAll(async () => {
        await electronApp.close();
    });

    test('shows the loading page, then login page', async () => {
        // App defaults to '#/loading' or starts checking session.
        // Even if checking session fails, it should land on '#/login'
        await window.waitForURL(/.*#\/login/);
        
        const loginTitle = await window.locator('h2.login-title');
        await expect(loginTitle).toContainText('SIGAA M.E.');

        // Verify inputs exist
        await expect(window.locator('#username')).toBeVisible();
        await expect(window.locator('#password')).toBeVisible();
        await expect(window.locator('#loginBtn')).toBeVisible();
    });

    test('validates empty login inputs', async () => {
        await window.waitForURL(/.*#\/login/);
        await window.click('#loginBtn');
        
        // The toast should appear with an error or validation message
        // In our app, there is no HTML5 explicit check, it just fails or shows error message
        // if empty. Wait, the login.ts might just do `if (!user) { showError() }`
        const errorToast = window.locator('.toast--error');
        await expect(errorToast).toBeVisible();
    });
});

describeOrSkip('App E2E (With Credentials)', () => {
    let electronApp: ElectronApplication;
    let window: Page;

    test.beforeAll(async () => {
        electronApp = await electron.launch({ args: ['.'] });
        window = await electronApp.firstWindow();
    });

    test.afterAll(async () => {
        // Clean up mock storage used inside E2E to not pollute real session
        await window.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await electronApp.close();
    });

    test('can log in and see dashboard', async () => {
        await window.waitForURL(/.*#\/login/);
        
        // Fill credentials
        await window.fill('#username', SIGAA_USER!);
        await window.fill('#password', SIGAA_PASS!);
        await window.click('#loginBtn');

        // It should navigate to sync-selection eventually
        await window.waitForURL(/.*#\/sync-selection/, { timeout: 30000 });
        
        const title = window.locator('.sync-title');
        await expect(title).toContainText('Selecione o Modo de Sincronização');
    });
});
