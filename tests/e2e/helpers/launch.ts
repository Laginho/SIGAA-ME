/**
 * Launch compartilhado do Electron para os specs de E2E.
 *
 * Dois detalhes que não são preferência, são requisito:
 *
 * - `--user-data-dir` temporário: sem isso o teste usa a sessão real do app e
 *   mexe no cache e nas credenciais de quem está rodando.
 * - `--no-sandbox`: obrigatório para rodar como root (container de CI ou de
 *   agente). Sem a flag o Chromium aborta com SIGTRAP antes de abrir janela.
 *
 * Um terceiro requisito não é flag: o `whenReady` do main procura um
 * `google-chrome` no PATH e, se não achar, abre um `dialog.showErrorBox` que
 * **bloqueia antes do `createWindow()`**. Num Linux sem Chrome o launch dá
 * timeout esperando a primeira janela, sem dizer por quê.
 */
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export interface LaunchedApp {
    app: ElectronApplication;
    page: Page;
    /** Erros de console e exceções capturados desde o load. */
    problems: string[];
}

export async function launchApp(userDataDirName = '.test-user-data'): Promise<LaunchedApp> {
    const userDataDir = path.resolve(process.cwd(), userDataDirName);
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }

    const app = await electron.launch({
        args: ['.', '--no-sandbox', `--user-data-dir=${userDataDir}`]
    });

    const page = await app.firstWindow();

    const problems: string[] = [];
    page.on('console', msg => {
        if (msg.type() === 'error') problems.push(`console: ${msg.text()}`);
    });
    page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));

    await page.waitForLoadState('domcontentloaded');
    return { app, page, problems };
}
