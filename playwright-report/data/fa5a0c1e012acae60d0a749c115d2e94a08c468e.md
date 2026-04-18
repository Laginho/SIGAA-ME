# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> App E2E >> validates empty login inputs
- Location: tests\e2e\app.spec.ts:54:5

# Error details

```
Error: page.click: Target page, context or browser has been closed
Call log:
  - waiting for locator('#loginBtn')

```

# Test source

```ts
  1   | import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';
  2   | import { config } from 'dotenv';
  3   | import path from 'path';
  4   | 
  5   | config({ path: path.resolve(process.cwd(), '.env') });
  6   | 
  7   | const SIGAA_USER = process.env.SIGAA_USER;
  8   | const SIGAA_PASS = process.env.SIGAA_PASS;
  9   | const hasCredentials = !!SIGAA_USER && !!SIGAA_PASS && SIGAA_USER !== 'your_sigaa_username';
  10  | 
  11  | const describeOrSkip = hasCredentials ? test.describe : test.describe.skip;
  12  | 
  13  | test.describe('App E2E', () => {
  14  |     let electronApp: ElectronApplication;
  15  |     let window: Page;
  16  | 
  17  |     test.beforeAll(async () => {
  18  |         // Use a temporary user-data-dir so tests don't share your real app session/cache
  19  |         const testUserDataDir = path.resolve(process.cwd(), '.test-user-data');
  20  |         electronApp = await electron.launch({ 
  21  |             args: ['.', `--user-data-dir=${testUserDataDir}`] 
  22  |         });
  23  |         window = await electronApp.firstWindow();
  24  |         window.on('console', msg => console.log('RENDERER:', msg.type(), msg.text()));
  25  |         window.on('pageerror', err => console.log('RENDERER EXCEPTION:', err.message));
  26  |         
  27  |         // Force clean slate for this test suite
  28  |         await window.waitForLoadState('domcontentloaded');
  29  |         await window.evaluate(() => {
  30  |             localStorage.clear();
  31  |             sessionStorage.clear();
  32  |         });
  33  |         await window.reload();
  34  |     });
  35  | 
  36  |     test.afterAll(async () => {
  37  |         await electronApp.close();
  38  |     });
  39  | 
  40  |     test('shows the loading page, then login page', async () => {
  41  |         // Since hash-based routing in Electron can sometimes elude waitForURL, rely on the DOM
  42  |         console.log('Current URL start:', window.url());
  43  |         
  44  |         await window.waitForSelector('h1.login-title', { timeout: 10000 });
  45  |         const loginTitle = window.locator('h1.login-title');
  46  |         await expect(loginTitle).toContainText('SIGAA-ME');
  47  | 
  48  |         // Verify inputs exist
  49  |         await expect(window.locator('#username')).toBeVisible();
  50  |         await expect(window.locator('#password')).toBeVisible();
  51  |         await expect(window.locator('#loginBtn')).toBeVisible();
  52  |     });
  53  | 
  54  |     test('validates empty login inputs', async () => {
  55  |         await window.waitForSelector('h1.login-title');
> 56  |         await window.click('#loginBtn');
      |                      ^ Error: page.click: Target page, context or browser has been closed
  57  |         
  58  |         // The toast should appear with an error or validation message
  59  |         // In our app, there is no HTML5 explicit check, it just fails or shows error message
  60  |         // if empty. Wait, the login.ts might just do `if (!user) { showError() }`
  61  |         const errorToast = window.locator('.toast--error');
  62  |         await expect(errorToast).toBeVisible();
  63  |     });
  64  | });
  65  | 
  66  | describeOrSkip('App E2E (With Credentials)', () => {
  67  |     let electronApp: ElectronApplication;
  68  |     let window: Page;
  69  | 
  70  |     test.beforeAll(async () => {
  71  |         const testUserDataDir = path.resolve(process.cwd(), '.test-user-data-auth');
  72  |         electronApp = await electron.launch({ 
  73  |             args: ['.', `--user-data-dir=${testUserDataDir}`] 
  74  |         });
  75  |         window = await electronApp.firstWindow();
  76  |         
  77  |         // Force clean slate for this test suite too
  78  |         await window.waitForLoadState('domcontentloaded');
  79  |         await window.evaluate(() => {
  80  |             localStorage.clear();
  81  |             sessionStorage.clear();
  82  |         });
  83  |         await window.reload();
  84  |     });
  85  | 
  86  |     test.afterAll(async () => {
  87  |         // Clean up mock storage used inside E2E to not pollute real session
  88  |         await window.evaluate(() => {
  89  |             localStorage.clear();
  90  |             sessionStorage.clear();
  91  |         });
  92  |         await electronApp.close();
  93  |     });
  94  | 
  95  |     test('can log in and see dashboard', async () => {
  96  |         await window.waitForSelector('h1.login-title');
  97  |         
  98  |         // Fill credentials
  99  |         await window.fill('#username', SIGAA_USER!);
  100 |         await window.fill('#password', SIGAA_PASS!);
  101 |         await window.click('#loginBtn');
  102 | 
  103 |         // It should navigate to sync-selection eventually
  104 |         await window.waitForSelector('.sync-title', { timeout: 30000 });
  105 |         
  106 |         const title = window.locator('.sync-title');
  107 |         await expect(title).toContainText('Selecione o Modo de Sincronização');
  108 |     });
  109 | });
  110 | 
```