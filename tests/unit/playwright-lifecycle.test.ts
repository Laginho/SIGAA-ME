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

    function makeFakePage() {
        return {
            goto: vi.fn(async () => {}),
            fill: vi.fn(async () => {}),
            click: vi.fn(async () => {}),
            waitForLoadState: vi.fn(async () => {}),
            url: vi.fn(() => 'https://si3.ufc.br/sigaa/portais/discente/discente.jsf'),
            $: vi.fn(async () => null),
            content: vi.fn(async () => '<html></html>'),
            on: vi.fn()
        };
    }

    function makeFakeContext() {
        return {
            newPage: vi.fn(async () => makeFakePage()),
            addCookies: vi.fn(async () => {}),
            cookies: vi.fn(async () => [])
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

    return { events, launch };
});

vi.mock('playwright', () => ({
    chromium: { launch: harness.launch }
}));

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => 'test-userdata'), isPackaged: true }
}));

vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
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
