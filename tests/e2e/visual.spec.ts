/**
 * Verificação visual: abre o app, percorre todas as rotas em tema claro e
 * escuro, e falha se alguma renderizar vazia ou cuspir erro no console.
 *
 * Roda sem credencial de propósito. O boot real chama `tryAutoLogin()`, que faz
 * login de verdade no SIGAA: lento, dependente de rede, não determinístico.
 * Para conferir UI isso é ruído, então plantamos fixture em
 * `sessionStorage`/`localStorage` e navegamos por hash.
 *
 * Os PNGs em `_agent_tmp/shots/` existem para um humano (ou um agente rodando
 * num Linux sem tela) olhar o resultado. Eles não são snapshots comparados
 * automaticamente — comparação pixel a pixel entre plataformas dá falso
 * positivo por causa de fonte, e não vale a manutenção neste projeto.
 */
import { expect, test } from '@playwright/test';
import path from 'path';
import { launchApp, type LaunchedApp } from './helpers/launch';

const SHOT_DIR = '_agent_tmp/shots';

const ACCOUNT = { name: 'ALUNO DE TESTE', photoUrl: '' };
const COURSES = [
    {
        id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1',
        fileCount: 12, files: [], news: [{ id: 'n1', title: 'Prova adiada', content: 'ok' }]
    },
    {
        id: 'c2', name: 'Cálculo Diferencial', code: 'CB0533', period: '2026.1',
        fileCount: 3, files: [], news: []
    }
];

const ROUTES = [
    { hash: '#/login', label: 'login' },
    { hash: '#/settings', label: 'settings' },
    { hash: '#/sync-selection', label: 'sync-selection' },
    { hash: '#/dashboard', label: 'dashboard' },
    { hash: '#/course/c1', label: 'course-detail' }
];

test.describe('Verificação visual das rotas', () => {
    let launched: LaunchedApp;

    test.beforeAll(async () => {
        launched = await launchApp('.test-user-data-visual');
        await launched.page.evaluate(([account, courses]) => {
            sessionStorage.setItem('account', JSON.stringify(account));
            localStorage.setItem('coursesWithFiles', JSON.stringify(courses));
        }, [ACCOUNT, COURSES] as const);
    });

    test.afterAll(async () => {
        await launched?.app.close();
    });

    for (const route of ROUTES) {
        for (const theme of ['light', 'dark'] as const) {
            test(`${route.label} · ${theme} renderiza`, async () => {
                const { page } = launched;

                await page.evaluate(([hash, t]) => {
                    document.documentElement.setAttribute('data-theme', t);
                    if (window.location.hash === hash) {
                        window.dispatchEvent(new HashChangeEvent('hashchange'));
                    } else {
                        window.location.hash = hash;
                    }
                }, [route.hash, theme] as const);

                await expect
                    .poll(() => page.evaluate(() => document.querySelector('#app')?.innerHTML.length ?? 0))
                    .toBeGreaterThan(50);

                await page.screenshot({
                    path: path.join(SHOT_DIR, `${route.label}-${theme}.png`),
                    fullPage: true
                });
            });
        }
    }

    test('nenhuma rota deixou erro no console', () => {
        // Roda por último: acumula o que as navegações acima produziram. Foi
        // assim que `window.api.getSettings is not a function` apareceu — o
        // dashboard renderizava, só renderizava o erro.
        expect(launched.problems).toEqual([]);
    });
});
