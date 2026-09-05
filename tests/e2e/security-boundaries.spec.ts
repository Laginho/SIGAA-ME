/**
 * SEC-003 — fronteiras da BrowserWindow no app de verdade.
 *
 * Roda sem credencial: nada aqui faz login. O que se prova é que a janela do
 * app nunca navega para fora dela (um site externo carregado na nossa janela
 * herdaria o preload e o `window.api`), que `window.open()` não cria janela, e
 * que link aprovado vai para o navegador do SO via `shell.openExternal`.
 *
 * Dois stubs no processo main, via `electronApp.evaluate`, antes de qualquer
 * clique: `shell.openExternal` passa a só registrar a URL (senão o teste
 * abriria o navegador real da máquina) e `dialog.showMessageBox` responde o
 * que o teste mandar (senão um modal ficaria aberto esperando alguém). Isso
 * exige que o `main.ts` chame `shell.openExternal` na hora do clique, não
 * capture a referência na instalação — é requisito do contrato, não detalhe.
 *
 * `mailto:` fica de fora de propósito: em vermelho abriria o cliente de e-mail
 * de quem está rodando. A classificação dele está no tier unitário.
 *
 * Em vermelho hoje: `window.open` devolve uma janela (e uma BrowserWindow
 * nova aparece), o link `file:` navega a janela do app para o `package.json`,
 * e `shell.openExternal` nunca é chamado.
 */
import { expect, test } from '@playwright/test';
import path from 'path';
import { pathToFileURL } from 'url';
import { launchApp, type LaunchedApp } from './helpers/launch';

const TRUSTED = 'https://si3.ufc.br/sigaa/verTelaLogin.do';
const UNTRUSTED = 'https://example.com/aviso';
// Existe em qualquer checkout, em qualquer plataforma.
const LOCAL_FILE = pathToFileURL(path.resolve(process.cwd(), 'package.json')).href;

interface Sec003State {
    opened: string[];
    dialogs: number;
    /** Índice do botão que o dialog "escolhe". 0 = abrir. */
    answer: number;
}

// Sem `serial`: cada teste compara com o estado que encontrou, então uma
// falha não esconde as outras — em vermelho o implementador vê todos os motivos.
test.describe('SEC-003: fronteiras da BrowserWindow', () => {
    let launched: LaunchedApp;
    let home: string;

    const state = () =>
        launched.app.evaluate(() => (globalThis as { __sec003?: Sec003State }).__sec003!);
    const setAnswer = (answer: number) =>
        launched.app.evaluate((_electron, n) => {
            (globalThis as { __sec003?: Sec003State }).__sec003!.answer = n;
        }, answer);
    const windowCount = () =>
        launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    const pageUrl = () => launched.page.url().split('#')[0];
    /** Mesmo caminho de um `<a href>` no corpo de uma notícia: âncora real, clique real. */
    const clickLink = (href: string) =>
        launched.page.evaluate((href) => {
            const a = document.createElement('a');
            a.href = href;
            a.textContent = 'link';
            document.body.appendChild(a);
            a.click();
            a.remove();
        }, href);

    test.beforeAll(async () => {
        launched = await launchApp('.test-user-data-security');
        home = pageUrl();

        await launched.app.evaluate(({ shell, dialog }) => {
            const g = globalThis as { __sec003?: Sec003State };
            g.__sec003 = { opened: [], dialogs: 0, answer: 1 };
            shell.openExternal = async (url: string) => {
                g.__sec003!.opened.push(url);
            };
            dialog.showMessageBox = (async () => {
                g.__sec003!.dialogs += 1;
                return { response: g.__sec003!.answer, checkboxChecked: false };
            }) as typeof dialog.showMessageBox;
        });
    });

    test.afterAll(async () => {
        await launched?.app.close();
    });

    test.beforeEach(async () => {
        // Em vermelho a navegação externa acontece de verdade; volta para casa
        // para o teste seguinte não herdar uma página estranha.
        if (pageUrl() !== home) {
            await launched.page.goto(home);
            await launched.page.waitForLoadState('domcontentloaded');
        }
    });

    test('o renderer vê window.api e não vê require nem process', async () => {
        const seen = await launched.page.evaluate(() => ({
            api: typeof window.api,
            require: typeof (window as unknown as { require?: unknown }).require,
            process: typeof (window as unknown as { process?: unknown }).process,
        }));
        expect(seen).toEqual({ api: 'object', require: 'undefined', process: 'undefined' });
    });

    test('window.open() não cria janela e não vai ao navegador', async () => {
        const returnedNull = await launched.page.evaluate(
            () => window.open('https://si3.ufc.br/sigaa/') === null,
        );
        await launched.page.waitForTimeout(500);

        expect(returnedNull).toBe(true);
        expect(await windowCount()).toBe(1);
        expect((await state()).opened).toEqual([]);
        expect(pageUrl()).toBe(home);
    });

    test('link file: não navega a janela do app', async () => {
        const before = await state();
        await clickLink(LOCAL_FILE);
        await launched.page.waitForTimeout(700);

        expect(pageUrl()).toBe(home);
        expect((await state()).opened).toEqual(before.opened);
        expect((await state()).dialogs).toBe(before.dialogs);
    });

    test('link ufc.br abre no navegador do SO, a janela fica onde está, sem dialog', async () => {
        const before = await state();
        await clickLink(TRUSTED);

        await expect.poll(async () => (await state()).opened).toEqual([...before.opened, TRUSTED]);
        expect(pageUrl()).toBe(home);
        expect((await state()).dialogs).toBe(before.dialogs);
        expect(await windowCount()).toBe(1);
        expect(await launched.page.evaluate(() => typeof window.api)).toBe('object');
    });

    test('link fora da allowlist: pede confirmação; cancelar não abre, confirmar abre', async () => {
        const before = await state();
        await setAnswer(1);
        await clickLink(UNTRUSTED);

        await expect.poll(async () => (await state()).dialogs).toBe(before.dialogs + 1);
        await launched.page.waitForTimeout(300);
        expect((await state()).opened).toEqual(before.opened);
        expect(pageUrl()).toBe(home);

        await setAnswer(0);
        await clickLink(UNTRUSTED);

        await expect.poll(async () => (await state()).opened).toEqual([...before.opened, UNTRUSTED]);
        expect((await state()).dialogs).toBe(before.dialogs + 2);
        expect(pageUrl()).toBe(home);
        expect(await windowCount()).toBe(1);
    });

    test('nenhuma tentativa deixou erro no console do renderer', () => {
        expect(launched.problems).toEqual([]);
    });
});
