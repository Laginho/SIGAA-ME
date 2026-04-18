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
        // Use a temporary user-data-dir so tests don't share your real app session/cache
        const testUserDataDir = path.resolve(process.cwd(), '.test-user-data');
        electronApp = await electron.launch({ 
            args: ['.', `--user-data-dir=${testUserDataDir}`] 
        });
        window = await electronApp.firstWindow();
        window.on('console', msg => console.log('RENDERER:', msg.type(), msg.text()));
        window.on('pageerror', err => console.log('RENDERER EXCEPTION:', err.message));
        
        // Force clean slate for this test suite
        await window.waitForLoadState('domcontentloaded');
        await window.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await window.reload();
    });

    test.afterAll(async () => {
        await electronApp.close();
    });

    test('shows the loading page, then login page', async () => {
        // Since hash-based routing in Electron can sometimes elude waitForURL, rely on the DOM
        console.log('Current URL start:', window.url());
        
        await window.waitForSelector('h1.login-title', { timeout: 10000 });
        const loginTitle = window.locator('h1.login-title');
        await expect(loginTitle).toContainText('SIGAA-ME');

        // Verify inputs exist
        await expect(window.locator('#username')).toBeVisible();
        await expect(window.locator('#password')).toBeVisible();
        await expect(window.locator('#loginBtn')).toBeVisible();
    });

    test('validates empty login inputs', async () => {
        await window.waitForSelector('h1.login-title');
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
        const testUserDataDir = path.resolve(process.cwd(), '.test-user-data-auth');
        electronApp = await electron.launch({ 
            args: ['.', `--user-data-dir=${testUserDataDir}`] 
        });
        window = await electronApp.firstWindow();
        
        // Force clean slate for this test suite too
        await window.waitForLoadState('domcontentloaded');
        await window.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        await window.reload();
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
        await window.waitForSelector('h1.login-title');
        
        // Fill credentials
        await window.fill('#username', SIGAA_USER!);
        await window.fill('#password', SIGAA_PASS!);
        await window.click('#loginBtn');

        // It should navigate to sync-selection eventually
        await window.waitForSelector('.sync-title', { timeout: 30000 });
        
        const title = window.locator('.sync-title');
        await expect(title).toContainText('Selecione o Modo de Sincronização');
    });

    test('can sync and interact with course materials (News & Downloads)', async () => {
        test.setTimeout(180000); // 3 minutes timeout for full sync processing
        
        // 1. We are currently on the sync selection page from the previous test.
        // Trigger fast sync and wait for dashboard navigation.
        await window.click('#btnFastSync');
        
        // 2. Wait for the loading overlay to finish and hit the dashboard
        await window.waitForSelector('.course-grid', { timeout: 150000 });
        
        const courses = window.locator('.course-card');
        expect(await courses.count()).toBeGreaterThan(0);
        
        // 3. Click the first available course to enter course-detail view
        await courses.first().click();
        
        // 4. Assert we are correctly viewing the course details
        await window.waitForSelector('.course-title', { timeout: 5000 });
        
        // 5. TEST FILE DOWNLOAD: Try to download the first file if one exists
        const fileDownloadBtns = window.locator('.download-btn'); // btn-icon or whatever it's classed
        // In course-detail.ts it renders: <button class="btn-icon" title="Baixar">...</button>
        const btnIcons = window.locator('button[title="Baixar"]');
        
        if (await btnIcons.count() > 0) {
            console.log('E2E: Found a file! Testing download mechanism...');
            await btnIcons.first().click();
            // A toast should eventually appear confirming success
            const toast = window.locator('.toast--success');
            await expect(toast).toBeVisible({ timeout: 15000 });
        } else {
            console.log('E2E: No files found in this course to test download.');
        }

        // 6. TEST NEWS: Try to expand a news modal
        const newsItems = window.locator('.news-item');
        if (await newsItems.count() > 0) {
            console.log('E2E: Found a news item! Testing expanding content modal...');
            await newsItems.first().click();
            
            // Assert modal opened and loaded content
            const modal = window.locator('.news-modal');
            await expect(modal).toBeVisible({ timeout: 10000 });
            
            // Wait for content body to be populated
            const modalContent = window.locator('.news-content-body');
            await expect(modalContent).not.toBeEmpty();
            
            // Assert we can close it
            await window.click('.close');
            await expect(modal).toBeHidden();
        } else {
            console.log('E2E: No news found in this course to test the modal.');
        }
    });
});
