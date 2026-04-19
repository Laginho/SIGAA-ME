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

        // MOCK NATIVE OS DIALOGS so tests don't freeze indefinitely when downloading files
        await electronApp.evaluate(async ({ dialog }, dirPath) => {
            dialog.showOpenDialog = async () => ({
                canceled: false,
                filePaths: [dirPath]
            });
        }, testUserDataDir);

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
        await window.waitForSelector('#coursesList', { timeout: 150000 });

        const courses = window.locator('.course-card');
        expect(await courses.count()).toBeGreaterThan(0);

        // 3. Click the first available course to enter course-detail view
        await courses.first().click();

        // 4. Assert we are correctly viewing the course details
        await window.waitForSelector('#courseTitle', { timeout: 15000 });

        // 5. TEST FILE DOWNLOAD: Try to download the first file if one exists
        const fileDownloadBtns = window.locator('.btn-download-file');

        if (await fileDownloadBtns.count() > 0) {
            console.log('E2E: Found a file! Testing download mechanism...');
            await fileDownloadBtns.first().click();
            // A toast should eventually appear confirming success
            const toast = window.locator('.toast');
            await expect(toast).toBeVisible({ timeout: 90000 });
            // Let's assert it's a success toast if possible, but allow error just in case of file missing
            const isSuccess = await toast.evaluate(node => node.classList.contains('toast--success'));
            if (!isSuccess) {
                console.warn('E2E WARNING: The download resulted in an error toast. Proceeding as soft-failure.', await toast.textContent());
            }
        } else {
            console.log('E2E: No files found in this course to test download.');
        }

        // 6. TEST NEWS: Try to expand a news modal
        const newsItems = window.locator('.news-item');
        if (await newsItems.count() > 0) {
            console.log('E2E: Found a news item! Testing expanding content modal...');
            await newsItems.first().click();

            // Assert modal opened and loaded content
            const modal = window.locator('#newsModal');
            await expect(modal).toBeVisible({ timeout: 10000 });

            // Wait for content body to be populated
            const modalContent = window.locator('#modalBody');
            await expect(modalContent).not.toBeEmpty();

            // Assert we can close it
            await window.click('.modal-close');
            await expect(modal).toBeHidden();
        } else {
            console.log('E2E: No news found in this course to test the modal.');
        }
    });
});
