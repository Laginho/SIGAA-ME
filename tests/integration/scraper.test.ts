/**
 * Integration Tests: Live SIGAA Smoke Test
 *
 * These tests hit the REAL SIGAA website using your credentials.
 *
 * Prerequisites:
 *   1. Copy `.env.example` to `.env`
 *   2. Fill in SIGAA_USER and SIGAA_PASS in `.env`
 *   3. Have Google Chrome installed
 *
 * Run with: npm test (or npm run test:watch for watch mode)
 *
 * ⚠️  These tests are SKIPPED automatically if credentials are not set.
 *     This means they are safe to run in CI without secrets.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';

// Load .env from the project root
config({ path: path.resolve(process.cwd(), '.env') });

// === Mock `electron` so the service can be imported outside Electron ===
import { vi } from 'vitest';
vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp/sigaa-me-test',
    },
}));
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        existsSync: vi.fn(() => true),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        createWriteStream: () => ({ write: vi.fn(), writable: true, on: vi.fn() }),
        promises: {
            ...actual.promises,
            writeFile: vi.fn(),
        },
    };
});

// ============================================================
// CONDITIONAL SKIP: skip all live tests if no credentials
// ============================================================
const SIGAA_USER = process.env.SIGAA_USER;
const SIGAA_PASS = process.env.SIGAA_PASS;

const hasCredentials = !!SIGAA_USER && !!SIGAA_PASS
    && SIGAA_USER !== 'your_sigaa_username';

const describeOrSkip = hasCredentials ? describe : describe.skip;

// ============================================================
// LIVE TESTS
// ============================================================
describeOrSkip('🌐 Live SIGAA Smoke Tests (requires .env)', () => {
    // Import the real service
    let PlaywrightLoginService: any;
    let service: any;

    beforeAll(async () => {
        const module = await import('../../electron/services/playwright-login.service');
        PlaywrightLoginService = module.PlaywrightLoginService;
        service = new PlaywrightLoginService();
    });

    afterAll(async () => {
        // Clean up the browser session
        if (service) {
            await service.close?.();
        }
    });

    it('should reach the SIGAA login page', async () => {
        // A quick check that the site is reachable before attempting login
        const { default: axios } = await import('axios');
        const response = await axios.get('https://si3.ufc.br/sigaa/verTelaLogin.do', {
            timeout: 10000,
        });
        expect(response.status).toBe(200);
        expect(response.data).toContain('SIGAA');
    });

    it('should successfully log in with stored credentials', async () => {
        const result = await service.login(SIGAA_USER!, SIGAA_PASS!);
        expect(result.success).toBe(true);
        expect(result.cookies).toBeDefined();
        expect(result.cookies!.length).toBeGreaterThan(0);
    }, 30000); // 30s timeout for Playwright

    it('should fetch the list of courses after login', async () => {
        const result = await service.getCourses();
        expect(result.success).toBe(true);
        expect(result.courses).toBeDefined();
        // A real student should have at least one course
        expect(result.courses!.length).toBeGreaterThan(0);
    }, 30000);

    it('fetched courses should have an id, code, and name', async () => {
        const result = await service.getCourses();
        if (result.success && result.courses!.length > 0) {
            const firstCourse = result.courses![0];
            expect(firstCourse.id).toBeDefined();
            expect(firstCourse.code).toBeDefined();
            expect(firstCourse.name).toBeDefined();
        }
    }, 30000);
});

// ============================================================
// OFFLINE INDICATOR: always runs, tells you if live tests skipped
// ============================================================
describe('Test Environment', () => {
    it('shows credentials status', () => {
        if (hasCredentials) {
            console.log('✅ .env found — live tests will run.');
        } else {
            console.warn('⚠️  No .env credentials found — live tests are SKIPPED.');
            console.warn('   Copy .env.example to .env and fill in your SIGAA credentials to enable them.');
        }
        // This test always passes — it's just informational
        expect(true).toBe(true);
    });
});
