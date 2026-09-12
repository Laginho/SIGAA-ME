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
 * Run explicitly (one real login per run; manual, before a release — PORTAL-004):
 *   npm run test:live
 * or, from any shell, with RUN_LIVE_SIGAA_TESTS=true in the environment.
 *
 * These tests are opt-in: credentials and the explicit opt-in are both
 * required, so the default suite remains offline and CI-safe.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config } from 'dotenv';
import path from 'path';
import type { SigaaService } from '../../electron/services/sigaa.service';
import type { CourseSummary } from '../../shared/domain';
import type { AppResult } from '../../shared/errors';

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
// CONDITIONAL SKIP: credentials and explicit opt-in are both required.
// ============================================================
const SIGAA_USER = process.env.SIGAA_USER;
const SIGAA_PASS = process.env.SIGAA_PASS;

const hasCredentials = !!SIGAA_USER && !!SIGAA_PASS
    && SIGAA_USER !== 'your_sigaa_username';
// `npm run test:live` is the opt-in itself: npm names the running script here.
const runLiveSmokeTests = process.env.RUN_LIVE_SIGAA_TESTS === 'true'
    || process.env.npm_lifecycle_event === 'test:live';

const describeOrSkip = hasCredentials && runLiveSmokeTests ? describe : describe.skip;

// ============================================================
// LIVE TESTS
// ============================================================
// The same entry points the app uses (SigaaService), in the order the app uses
// them, in one login session. Portal classification is asserted through the
// production validators (PORTAL-001): a structural change fails `getCourses` or
// `getCourseFiles` with `SELECTOR_DRIFT`, and `unwrap` names that code.
// Counts are never asserted — zero courses, files or news is a valid account.
describeOrSkip('🌐 Live SIGAA Smoke Tests (requires .env)', () => {
    let service: SigaaService;
    let courses: CourseSummary[] = [];

    beforeAll(async () => {
        const module = await import('../../electron/services/sigaa.service');
        service = new module.SigaaService();
    });

    afterAll(async () => {
        // logout() is asserted below; this only covers a run that failed before it.
        await service?.logout();
    });

    function unwrap<T>(result: AppResult<T>): T {
        if (!result.success) throw new Error(`${result.error.code}: ${result.error.message}`);
        return result.data;
    }

    it('reaches the SIGAA login page', async () => {
        const { default: axios } = await import('axios');
        const response = await axios.get('https://si3.ufc.br/sigaa/verTelaLogin.do', {
            timeout: 10000,
        });
        expect(response.status).toBe(200);
        expect(response.data).toContain('SIGAA');
    });

    it('logs in with the stored credentials', async () => {
        const profile = unwrap(await service.login(SIGAA_USER!, SIGAA_PASS!));
        expect(profile.id).toBeTruthy();
        expect(profile.name).toBeTruthy();
    }, 60000);

    it('enumerates courses: recognised list, well-formed rows, any count', async () => {
        courses = unwrap(await service.getCourses()).courses;
        for (const course of courses) {
            expect(course.id).toBeTruthy();
            expect(typeof course.code).toBe('string');
            expect(course.name).toBeTruthy();
            expect(typeof course.period).toBe('string');
        }
    }, 60000);

    it('enters the first course and gets well-formed files and news', async () => {
        if (courses.length === 0) return;
        const { files, news } = unwrap(await service.getCourseFiles(courses[0].id, courses[0].name));
        expect(Array.isArray(files)).toBe(true);
        expect(Array.isArray(news)).toBe(true);
        for (const file of files) {
            expect(file.id).toBeTruthy();
            expect(file.name).toBeTruthy();
            expect(['file', 'link']).toContain(file.type);
        }
        for (const item of news) {
            expect(item.id).toBeTruthy();
            expect(item.title).toBeTruthy();
            expect(typeof item.date).toBe('string');
        }
    }, 90000);

    it('logs out and releases the browser', async () => {
        await expect(service.logout()).resolves.toBeUndefined();
    }, 30000);
});

// ============================================================
// OFFLINE INDICATOR: always runs, tells you if live tests skipped
// ============================================================
describe('Test Environment', () => {
    it('shows credentials status', () => {
        if (hasCredentials && runLiveSmokeTests) {
            console.log('✅ .env found and live SIGAA tests are enabled.');
        } else if (hasCredentials) {
            console.warn('⚠️  .env credentials found, but live SIGAA tests are disabled by default.');
            console.warn("   Set RUN_LIVE_SIGAA_TESTS='true' to run them intentionally.");
        } else {
            console.warn('⚠️  No .env credentials found — live tests are SKIPPED.');
            console.warn('   Copy .env.example to .env and fill in your SIGAA credentials to enable them.');
        }
        // This test always passes — it's just informational
        expect(true).toBe(true);
    });
});
