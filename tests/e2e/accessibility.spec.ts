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
        await page.evaluate(() => document.body.focus());

        let reached = false;
        for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab');
            const id = await page.evaluate(() => document.activeElement?.id ?? null);
            if (id === 'notificationBellBtn') {
                reached = true;
                break;
            }
        }
        expect(reached).toBe(true);

        const bell = page.locator('#notificationBellBtn');
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
        // `.btn-refresh` tem `transition: all 0.2s` (dashboard.css): outline-width
        // e outline-color são propriedades animáveis, então o valor computado
        // logo após o foco ainda reflete o início da transição, não o alvo —
        // espera estabilizar antes de ler.
        await expect.poll(() => refreshBtn.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe('2px');
        const { outlineStyle, outlineWidth } = await refreshBtn.evaluate((el) => {
            const s = getComputedStyle(el);
            return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
        });
        expect(outlineStyle).not.toBe('none');
        expect(parseFloat(outlineWidth)).toBeGreaterThanOrEqual(1);
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
            // separada por vírgula. O Chromium normaliza 0.01ms como
            // segundos e pode usar notação científica ("1e-05s") — em vez de
            // casar a string, converte pra segundos e confere que é ínfimo
            // (a duração original era 0.2s).
            for (const part of duration.split(',').map(p => p.trim())) {
                const seconds = part.endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part);
                expect(seconds).toBeLessThan(0.001);
            }
        } finally {
            await page.emulateMedia({ reducedMotion: null });
        }
    });

    test.describe('Modal de notícia (dialog nativo)', () => {
        test.beforeEach(async () => {
            await goto('#/course/c1');
        });

        test('título da notícia mantém a tipografia do corpo, não a do <button> nativo', async () => {
            const { page } = launched;
            const bodyFont = await page.evaluate(() => {
                const s = getComputedStyle(document.body);
                return { fontSize: s.fontSize, lineHeight: s.lineHeight };
            });
            const titleFont = await page.locator('.news-item .news-title').first().evaluate((el) => {
                const s = getComputedStyle(el);
                return { fontSize: s.fontSize, lineHeight: s.lineHeight };
            });
            expect(titleFont).toEqual(bodyFont);
        });

        test('abrir por teclado foca dentro do dialog; Escape fecha e devolve o foco ao item que abriu', async () => {
            const { page } = launched;
            const item = page.locator('.news-item').first();
            const itemId = await item.getAttribute('data-id');
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

            // Compara pelo `data-id` do item, não `!== null`: com optional
            // chaining, `document.activeElement` ausente vira `undefined`, e
            // `undefined !== null` é `true` — a asserção antiga passava sem
            // nenhum foco restaurado.
            const focusedId = await page.evaluate(() => document.activeElement?.getAttribute('data-id') ?? null);
            expect(focusedId).toBe(itemId);
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
        test.afterAll(async () => {
            await launched.page.emulateMedia({ reducedMotion: null });
            await launched.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
        });

        const ROUTES: [string, string][] = [
            ['#/dashboard', 'dashboard'],
            ['#/sync-selection', 'sync-selection'],
            ['#/settings', 'settings'],
            ['#/course/c1', 'course-detail'],
        ];
        // O tema escuro tem seus próprios tokens de cor (main.css) — sem
        // escanear as duas, uma regressão de contraste só no tema escuro
        // passa em branco (foi o que aconteceu com sync-selection.css).
        const THEMES = ['light', 'dark'] as const;

        for (const theme of THEMES) {
            for (const [hash, label] of ROUTES) {
                test(`${label} (tema ${theme}) sem violação crítica/séria`, async () => {
                    const { page } = launched;
                    // Sem isso o axe pode amostrar a página no meio do fade-in de
                    // 0.8s (`.sync-selection-container`) — cor real, leitura errada
                    // porque a opacidade ainda não chegou a 1. `reduced-motion`
                    // zera a duração (main.css, A11Y-001) e garante estado final.
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
                    await goto(hash);
                    // Sem isto o teste só prova que o atributo foi escrito antes
                    // da navegação, não que sobreviveu a ela — um render que
                    // resetasse `data-theme` passaria em branco (A11Y-001).
                    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
                    // `legacyMode`: o modo padrão roda a análise final numa página em
                    // branco à parte (`context.newPage()`) para escapar do CSP do
                    // app — e o Electron não suporta criar um novo target por CDP
                    // pra essa contexto (`Target.createTarget: Not supported`).
                    // Legacy roda tudo direto na própria página.
                    const results = await new AxeBuilder({ page: launched.page }).setLegacyMode(true).analyze();
                    const severe = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
                    expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
                });
            }
        }
    });
});
