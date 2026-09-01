/**
 * PROTÓTIPO — gera prints da página de disciplina em dark mode: o estado
 * atual (quebrado) e os três esquemas candidatos de
 * `src/styles/course-detail.prototype-dark.css`. Descartável junto com ele.
 *
 * O build de produção não contém o CSS do protótipo (gate DEV no main.ts),
 * então o spec injeta o arquivo via addStyleTag — mesma cascata, mesmos
 * seletores que o dev usa.
 *
 * PNGs em `_agent_tmp/shots/proto-scheme-*.png`. Não é comparação automática;
 * é material para um humano escolher o esquema.
 */
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { launchApp, type LaunchedApp } from './helpers/launch';

const SHOT_DIR = '_agent_tmp/shots';
const PROTO_CSS = path.resolve(process.cwd(), 'src/styles/course-detail.prototype-dark.css');

const ACCOUNT = { name: 'ALUNO DE TESTE', photoUrl: '' };
const COURSE = {
    id: 'c1', name: 'Estatística para Engenharia', code: 'TI0111', period: '2026.1',
    fileCount: 4,
    files: [
        { name: 'Introdução ao R (anotações nos slides)', url: '#', script: '' },
        { name: 'Distribuição de frequência (código no R)', url: '#', script: '' },
        { name: 'Discussão do plano da disciplina', url: '#', script: '' },
        { name: 'Lista de exercícios 1', url: '#', script: '' }
    ],
    news: [
        { id: 'n1', title: '[TI0111] Primeira aula', date: '11/08/2026 17:53', notification: 'Sim' },
        { id: 'n2', title: '[TI0111] Prova adiada', date: '25/08/2026 09:10', notification: 'Não' }
    ]
};

// Metade dos itens marcados como lidos para o print mostrar os dois estados
// (com e sem bolinha dourada).
const READ_ITEMS = [
    'file-c1-Discussão do plano da disciplina',
    'file-c1-Lista de exercícios 1',
    'news-c1-n2'
];

const VARIANTS = ['atual', 'a', 'b', 'c'] as const;

test.describe('Prints dos esquemas de dark mode (protótipo)', () => {
    let launched: LaunchedApp;

    test.beforeAll(async () => {
        launched = await launchApp('.test-user-data-proto');
        await launched.page.evaluate(([account, course, readItems]) => {
            sessionStorage.setItem('account', JSON.stringify(account));
            localStorage.setItem('coursesWithFiles', JSON.stringify([course]));
            localStorage.setItem('readItems', JSON.stringify(readItems));
        }, [ACCOUNT, COURSE, READ_ITEMS] as const);
        await launched.page.addStyleTag({ content: fs.readFileSync(PROTO_CSS, 'utf8') });
    });

    test.afterAll(async () => {
        await launched?.app.close();
    });

    for (const variant of VARIANTS) {
        test(`esquema ${variant}`, async () => {
            const { page } = launched;

            await page.evaluate((scheme) => {
                document.documentElement.setAttribute('data-theme', 'dark');
                if (scheme === 'atual') {
                    document.documentElement.removeAttribute('data-proto-scheme');
                } else {
                    document.documentElement.setAttribute('data-proto-scheme', scheme);
                }
                if (window.location.hash === '#/course/c1') {
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                } else {
                    window.location.hash = '#/course/c1';
                }
            }, variant);

            await expect
                .poll(() => page.evaluate(() => document.querySelectorAll('.file-item').length))
                .toBeGreaterThan(0);

            await page.screenshot({
                path: path.join(SHOT_DIR, `proto-scheme-${variant}.png`),
                fullPage: true
            });
        });
    }
});
