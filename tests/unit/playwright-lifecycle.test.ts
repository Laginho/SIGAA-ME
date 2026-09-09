/**
 * Regression test for the Chrome-per-sync leak: PlaywrightLoginService used to
 * assign a fresh `chromium.launch()` result over `this.browser` without
 * closing the previous instance, leaking a full browser/context/page tree on
 * every login and every sync cycle. See plans/001-browser-lifecycle.md.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
    const events: string[] = [];
    let nextId = 0;
    /** O que `context.cookies()` devolve — o login guarda isso como sessão. */
    const state = { cookies: [] as { name: string; value: string; domain: string; path: string }[] };

    function makeFakePage() {
        let atLogin = false;
        return {
            goto: vi.fn(async (url: string) => { atLogin = url.includes('verTelaLogin'); }),
            fill: vi.fn(async () => {}),
            click: vi.fn(async () => { atLogin = false; }),
            waitForLoadState: vi.fn(async () => {}),
            url: vi.fn(() => atLogin ? 'https://si3.ufc.br/sigaa/verTelaLogin.do' : 'https://si3.ufc.br/sigaa/paginaInicial.do'),
            $: vi.fn(async () => null),
            content: vi.fn(async () => atLogin
                ? '<form action="/sigaa/logar.do"><input name="user.login"><input name="user.senha"><input name="entrar" type="submit"></form>'
                : '<h1>Portal do Discente</h1><a href="/sigaa/verPortalDiscente.do">Menu Discente</a><span class="nome_usuario">User</span>'),
            on: vi.fn()
        };
    }

    function makeFakeContext() {
        return {
            newPage: vi.fn(async () => makeFakePage()),
            addCookies: vi.fn(async () => {}),
            cookies: vi.fn(async () => state.cookies)
        };
    }

    function makeFakeBrowser(id: number) {
        return {
            newContext: vi.fn(async () => makeFakeContext()),
            close: vi.fn(async () => {
                events.push(`close:${id}`);
            })
        };
    }

    const launch = vi.fn(async () => {
        const id = nextId++;
        events.push(`launch:${id}`);
        return makeFakeBrowser(id);
    });

    return { events, launch, state };
});

vi.mock('playwright', () => ({
    chromium: { launch: harness.launch }
}));

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => 'test-userdata'), isPackaged: true }
}));

vi.mock('../../electron/services/logger.service', () => ({
    logger: {
        info: vi.fn(), warn: vi.fn(), error: vi.fn(),
        scope: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
    }
}));

import { PlaywrightLoginService } from '../../electron/services/playwright-login.service';

describe('PlaywrightLoginService browser lifecycle', () => {
    beforeEach(() => {
        harness.events.length = 0;
        harness.launch.mockClear();
    });

    it('closes the previous browser before launching a new one on a second login', async () => {
        const service = new PlaywrightLoginService();

        const first = await service.login('user', 'pass');
        expect(first.success).toBe(true);

        const second = await service.login('user', 'pass');
        expect(second.success).toBe(true);

        expect(harness.launch).toHaveBeenCalledTimes(2);
        // The first browser must be closed before the second one launches,
        // otherwise the first browser's process tree leaks.
        expect(harness.events).toEqual(['launch:0', 'close:0', 'launch:1']);
    });

    it('close() releases browser/context/page and is idempotent', async () => {
        const service = new PlaywrightLoginService();
        const result = await service.login('user', 'pass');
        expect(result.success).toBe(true);

        await service.close();
        await expect(service.close()).resolves.not.toThrow();
    });
});

// ── DATA-002: sair de verdade ────────────────────────────────────────────────
//
// `close()` solta o navegador mas guarda `storedCookies`, `storedUsername` e
// `storedPassword` — de propósito: `getCourses()` fecha e relança com eles a
// cada sync. Logout precisa de outro método, que esqueça a sessão: sem isso,
// depois de "Sair", um sync em voo relança o Chrome com os cookies e a senha de
// quem acabou de sair.
describe('PlaywrightLoginService.logout() (DATA-002)', () => {
    const SESSION = [{ name: 'JSESSIONID', value: 'abc', domain: 'si3.ufc.br', path: '/' }];

    beforeEach(() => {
        harness.events.length = 0;
        harness.launch.mockClear();
        harness.state.cookies = SESSION;
    });

    it('positive control: close() alone keeps the stored session, which getCourses relies on', async () => {
        const service = new PlaywrightLoginService();
        expect((await service.login('user', 'pass')).success).toBe(true);

        await service.close();

        expect(await service.getCookies()).toEqual(SESSION);
    });

    it('logout() forgets cookies and credentials: nothing can relaunch a browser on behalf of who left', async () => {
        const service = new PlaywrightLoginService();
        expect((await service.login('user', 'pass')).success).toBe(true);
        expect(await service.getCookies()).toEqual(SESSION);

        await service.logout();
        harness.launch.mockClear();

        expect(await service.getCookies()).toEqual([]);
        expect(await service.reloginWithStoredCredentials()).toEqual({
            success: false,
            error: 'No stored credentials available',
        });
        const courses = await service.getCourses();
        expect(courses.success).toBe(false);
        expect(harness.launch).not.toHaveBeenCalled();
    });

    it('logout() is idempotent and safe before any login', async () => {
        const service = new PlaywrightLoginService();
        await expect(service.logout()).resolves.not.toThrow();
        await expect(service.logout()).resolves.not.toThrow();
    });
});
