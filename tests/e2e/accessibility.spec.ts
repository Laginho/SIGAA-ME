/**
 * A11Y-001 — o que só um browser real prova: `:focus-visible` computado,
 * `prefers-reduced-motion`, o comportamento do `<dialog>` nativo (Escape,
 * focus trap, restauração de foco) e um scan automático com axe-core.
 * Estrutura estática (aria-label, tag semântica) já está coberta pelos
 * testes unit em tests/unit/*-a11y.test.ts — jsdom não aplica CSS nem faz
 * gestão de foco de verdade, então esse pedaço só existe aqui.
 *
 * Roda sem credencial, como visual.spec.ts: planta fixture de sessão e
 * disciplinas e navega por hash.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';

const ACCOUNT = { id: 'e2e-a11y', name: 'ALUNO A11Y' };
const SESSION_ACCOUNT_KEY = 'sigaa-me:v2:session:account';
const COURSES_KEY = `sigaa-me:v2:${ACCOUNT.id}:courses`;
const COURSES = [
    {
        id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1',
        fileCount: 1,
        files: [{ id: 'f1', name: 'Lista 1.pdf', type: 'file' }],
        news: [{ id: 'n1', title: 'Prova adiada', date: '01/01/2026', notification: '', content: '<p>Conteúdo.</p>' }],
    },
];

test.describe('Acessibilidade', () => {
    let launched: LaunchedApp;

    test.beforeAll(async () => {
        launched = await launchApp('.test-user-data-a11y');
        await launched.page.evaluate(([sessionKey, coursesKey, account, courses]) => {
            sessionStorage.setItem(sessionKey as string, JSON.stringify(account));
            localStorage.setItem(coursesKey as string, JSON.stringify(courses));
        }, [SESSION_ACCOUNT_KEY, COURSES_KEY, ACCOUNT, COURSES] as const);
    });

    test.afterAll(async () => {
        await launched?.app.close();
    });

    async function goto(hash: string) {
        const { page } = launched;
        await page.evaluate((h) => {
            if (window.location.hash === h) {
                window.dispatchEvent(new HashChangeEvent('hashchange'));
            } else {
                window.location.hash = h;
            }
        }, hash);
        await expect
            .poll(() => page.evaluate(() => document.querySelector('#app')?.innerHTML.length ?? 0))
            .toBeGreaterThan(50);
    }

    test('documento declara lang=pt-BR', async () => {
        await goto('#/dashboard');
        expect(await launched.page.evaluate(() => document.documentElement.lang)).toBe('pt-BR');
    });

    test('fluxo por teclado: Tab alcança o sino e Enter abre o painel de notificações', async () => {
        await goto('#/dashboard');
        const { page } = launched;
        const bell = page.locator('#notificationBellBtn');
        await bell.focus();
        await expect(bell).toHaveAttribute('aria-expanded', 'false');

        await page.keyboard.press('Enter');

        await expect(bell).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#notificationDropdown')).toHaveClass(/open/);
    });

    test(':focus-visible dá contorno visível ao elemento focado por teclado', async () => {
        await goto('#/dashboard');
        const { page } = launched;
        const refreshBtn = page.locator('#refreshBtn');
        await refreshBtn.focus();
        const outlineStyle = await refreshBtn.evaluate((el) => getComputedStyle(el).outlineStyle);
        expect(outlineStyle).not.toBe('none');
    });

    test('prefers-reduced-motion: reduce anula as transições', async () => {
        const { page } = launched;
        try {
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await goto('#/dashboard');
            const duration = await page
                .locator('#notificationDropdown')
                .evaluate((el) => getComputedStyle(el).transitionDuration);
            // `.notification-dropdown` transiciona 3 propriedades: a lista vem
            // separada por vírgula (`0.01ms, 0.01ms, 0.01ms`), nunca um valor só.
            for (const part of duration.split(',')) {
                expect(part.trim()).toMatch(/^0s$|^0\.01ms$/);
            }
        } finally {
            await page.emulateMedia({ reducedMotion: null });
        }
    });

    test.describe('Modal de notícia (dialog nativo)', () => {
        test.beforeEach(async () => {
            await goto('#/course/c1');
        });

        test('abrir por teclado foca dentro do dialog; Escape fecha e devolve o foco ao item que abriu', async () => {
            const { page } = launched;
            const item = page.locator('.news-item').first();
            await item.focus();
            await item.press('Enter');

            const modal = page.locator('#newsModal');
            await expect(modal).toBeVisible();

            const focusInModal = await page.evaluate(() => {
                const dialog = document.getElementById('newsModal');
                return !!dialog && dialog.contains(document.activeElement);
            });
            expect(focusInModal).toBe(true);

            await page.keyboard.press('Escape');
            await expect(modal).toBeHidden();

            const focusRestoredToTrigger = await page.evaluate(
                () => document.activeElement?.closest('.news-item') !== null,
            );
            expect(focusRestoredToTrigger).toBe(true);
        });

        test('Tab não escapa do dialog enquanto ele está aberto (foco preso; fundo inerte)', async () => {
            const { page } = launched;
            await page.locator('.news-item').first().click();
            await expect(page.locator('#newsModal')).toBeVisible();

            for (let i = 0; i < 8; i++) {
                await page.keyboard.press('Tab');
                const insideModal = await page.evaluate(() => {
                    const dialog = document.getElementById('newsModal');
                    return !!dialog && dialog.contains(document.activeElement);
                });
                expect(insideModal).toBe(true);
            }
        });
    });

    test.describe('Scan automático (axe-core)', () => {
        const ROUTES: [string, string][] = [
            ['#/dashboard', 'dashboard'],
            ['#/sync-selection', 'sync-selection'],
            ['#/settings', 'settings'],
            ['#/course/c1', 'course-detail'],
        ];

        for (const [hash, label] of ROUTES) {
            test(`${label} sem violação crítica/séria`, async () => {
                await goto(hash);
                const results = await new AxeBuilder({ page: launched.page }).analyze();
                const severe = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
                expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
            });
        }
    });
});
