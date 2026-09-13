/**
 * DATA-002 — clear-all no app de verdade, sem credencial.
 *
 * O que os testes unitários não conseguem provar: que os arquivos do `userData`
 * somem **no Windows**, onde o `logs/app.log` e o `scraper.log` estão com
 * stream aberto e um `unlink` ingênuo falha; que o `settings.json` que o app
 * escreveu de verdade volta ao default no processo vivo; e que o storage do
 * renderer fica vazio depois de o main limpar a partição.
 *
 * O `dialog.showMessageBox` é trocado por um stub no main antes de qualquer
 * clique (padrão do `security-boundaries.spec.ts`): senão um modal ficaria
 * aberto esperando alguém. O stub anota o texto para conferir o aviso sobre os
 * arquivos baixados.
 *
 * A fixture de sessão/disciplinas é a do `visual.spec.ts` (DATA-001). Os
 * arquivos plantados no `userData` são escritos **depois** do launch — o
 * `launchApp` apaga a pasta antes — e é isso que o teste quer: provar que a
 * limpeza apaga o que existe no disco, não só o que o processo lembra.
 *
 * Em vermelho hoje: o 🗑️ exige dois cliques, nenhum dialog aparece, e
 * `cache.json`, `logs/`, `debug_*` e `settings.json` continuam no disco.
 */
import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { launchApp, type LaunchedApp } from './helpers/launch';

const USER_DATA_DIR = '.test-user-data-clear-all';
const ACCOUNT = { id: 'e2e-account', name: 'ALUNO DE TESTE' };
const SESSION_ACCOUNT_KEY = 'sigaa-me:v2:session:account';
const COURSES_KEY = `sigaa-me:v2:${ACCOUNT.id}:courses`;
const COURSES = [
    { id: 'c1', name: 'Estruturas de Dados', code: 'CK0210', period: '2026.1', fileCount: 0, files: [], news: [] },
];
const MARKER = 'PLANTED-BY-DATA-002-E2E';

interface ClearAllState {
    answer: number;
    dialogs: number;
    texts: string[];
}

test.describe.serial('DATA-002: clear-all no app', () => {
    let launched: LaunchedApp;
    let userData: string;

    const state = () =>
        launched.app.evaluate(() => (globalThis as { __data002?: ClearAllState }).__data002!);
    const setAnswer = (answer: number) =>
        launched.app.evaluate((_electron, n) => {
            (globalThis as { __data002?: ClearAllState }).__data002!.answer = n;
        }, answer);

    const planted = () => ({
        cache: path.join(userData, 'cache.json'),
        settings: path.join(userData, 'settings.json'),
        log: path.join(userData, 'logs', 'app.log'),
        rotatedLog: path.join(userData, 'logs', 'app.1.log'),
        // OBS-003: os dumps crus deixaram a raiz do `userData` e passaram a
        // viver em `diagnostics/`, atrás do gate de `DiagnosticsService.saveRaw`
        // — mesma pasta e mesmo `clear()` do diagnóstico estrutural (PORTAL-003).
        debugLogin: path.join(userData, 'diagnostics', 'debug_login_page.html'),
        debugPortal: path.join(userData, 'diagnostics', 'debug_portal_fail_540316.html'),
        // `sigaa-me.log` saiu em OBS-001, `scraper.log` em OBS-004, junto com
        // os loggers antigos; sobra do legado em disco é limpeza de boot, em
        // OBS-003. `app.log`/`app.1.log` são o que o LoggerService (OBS-001)
        // escreve de verdade (OBS-005).
    });

    function plantUserData() {
        const p = planted();
        fs.mkdirSync(path.dirname(p.log), { recursive: true });
        fs.mkdirSync(path.dirname(p.debugLogin), { recursive: true });
        fs.writeFileSync(p.cache, JSON.stringify({ schemaVersion: 2, accounts: { [ACCOUNT.id]: { courses: { c1: { files: ['1'], news: [] } }, updatedAt: 1 } } }));
        fs.writeFileSync(p.log, `${MARKER}\n`);
        fs.writeFileSync(p.rotatedLog, `${MARKER}\n`);
        fs.writeFileSync(p.debugLogin, '<html></html>');
        fs.writeFileSync(p.debugPortal, '<html></html>');
    }

    async function openDashboard() {
        const { page } = launched;
        await page.evaluate(([sessionKey, coursesKey, account, courses]) => {
            sessionStorage.setItem(sessionKey as string, JSON.stringify(account));
            localStorage.setItem(coursesKey as string, JSON.stringify(courses));
            window.location.hash = '#/dashboard';
        }, [SESSION_ACCOUNT_KEY, COURSES_KEY, ACCOUNT, COURSES] as const);
        await expect(page.locator('#clearDataBtn')).toBeVisible();
    }

    test.beforeAll(async () => {
        launched = await launchApp(USER_DATA_DIR);
        userData = path.resolve(process.cwd(), USER_DATA_DIR);

        await launched.app.evaluate(({ dialog }) => {
            const g = globalThis as { __data002?: ClearAllState };
            g.__data002 = { answer: 1, dialogs: 0, texts: [] };
            dialog.showMessageBox = (async (...args: unknown[]) => {
                const options = args[args.length - 1] as { message?: string; detail?: string };
                g.__data002!.dialogs += 1;
                g.__data002!.texts.push(`${options.message ?? ''} ${options.detail ?? ''}`);
                return { response: g.__data002!.answer, checkboxChecked: false };
            }) as typeof dialog.showMessageBox;
        });

        // Estado não-default escrito pelo app de verdade, não plantado.
        await launched.page.evaluate(() => window.api.updateSetting('theme', 'dark'));
        await expect.poll(() => fs.existsSync(planted().settings)).toBe(true);

        await openDashboard();
    });

    test.afterAll(async () => {
        await launched?.app.close();
    });

    test('recusar o dialog não apaga nada e o aviso sobre os arquivos baixados está no texto', async () => {
        plantUserData();
        await setAnswer(1);

        await launched.page.click('#clearDataBtn');
        await expect.poll(async () => (await state()).dialogs).toBe(1);

        const { texts } = await state();
        expect(texts[0]).toMatch(/arquivos baixados/i);
        expect(texts[0]).toMatch(/n[aã]o ser[aã]o apagados/i);

        // Tempo para uma implementação errada apagar algo — nada deve mudar.
        await launched.page.waitForTimeout(500);
        const p = planted();
        expect(fs.existsSync(p.cache)).toBe(true);
        expect(fs.existsSync(p.log)).toBe(true);
        expect(fs.existsSync(p.rotatedLog)).toBe(true);
        expect(fs.existsSync(p.debugLogin)).toBe(true);
        expect(fs.existsSync(p.settings)).toBe(true);
        await expect(launched.page.locator('#clearDataBtn')).toBeVisible();
        const stillThere = await launched.page.evaluate((key) => localStorage.getItem(key as string) !== null, COURSES_KEY);
        expect(stillThere).toBe(true);
    });

    test('confirmar apaga o userData, o storage do renderer, volta as configurações ao default e cai no login', async () => {
        await setAnswer(0);

        await launched.page.click('#clearDataBtn');
        await expect(launched.page.locator('h1.login-title')).toBeVisible({ timeout: 15_000 });

        const p = planted();
        for (const file of [p.cache, p.settings, p.log, p.rotatedLog, p.debugLogin, p.debugPortal]) {
            expect(fs.existsSync(file), `${path.relative(userData, file)} ainda existe`).toBe(false);
        }
        expect(fs.existsSync(path.join(userData, 'credentials.json'))).toBe(false);

        const storage = await launched.page.evaluate((key) => ({
            local: localStorage.length,
            session: sessionStorage.getItem(key as string),
        }), SESSION_ACCOUNT_KEY);
        expect(storage).toEqual({ local: 0, session: null });

        const theme = await launched.page.evaluate(() => window.api.getSettings().then(s => s.theme));
        expect(theme).toBe('light');
    });

    test('o processo continua de pé e nenhuma etapa deixou erro no console', async () => {
        await expect(launched.page.locator('#loginBtn')).toBeVisible();
        expect(launched.problems).toEqual([]);
    });
});
