/**
 * SEC-003 — política de navegação da BrowserWindow e de link externo.
 *
 * Vermelho hoje pelo motivo certo: `electron/security/navigation-policy.ts`
 * não existe (a falha de import é o vermelho legítimo). Quando existir, a
 * parte 3 continua vermelha até o `main.ts` passar `webPreferences`
 * explícitos e instalar o guard no `webContents` da janela.
 *
 * Quatro partes:
 *
 * 1. `classifyNavigation(target, appUrl)`: função pura, sem Electron. Decide
 *    entre `in-app` (só o próprio app), `external` (https:/mailto:, com
 *    `trusted` para ufc.br e o GitHub do projeto) e `blocked` (todo o resto).
 * 2. `installNavigationGuard(contents, deps)`: fakes puros. Registra
 *    `will-navigate` e `setWindowOpenHandler`; `window.open` é sempre negado;
 *    confiável abre direto, não confiável passa por `confirmExternal`;
 *    rejeição de `openExternal`/`confirmExternal` é logada, não vaza.
 * 3. `main.ts` de verdade, importado com `electron` mockado (padrão do
 *    `updater-consent.test.ts`) e `whenReady` disparando o callback na hora,
 *    o que executa `createWindow()` durante o import. Aí dá para ler as
 *    `webPreferences` passadas ao construtor e os handlers registrados no
 *    `webContents` da janela real — `getLastWebPreferences()` não existe mais
 *    no Electron 30, então o E2E não consegue fazer isso.
 * 4. Zona de fronteira do ESLint cobre `electron/security/`.
 *
 * Contrato e decisões: `.scratch/04-fase3-fronteiras-de-confianca/issues/04-SEC-003-*.md`.
 */
import path from 'path';
import { pathToFileURL } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ESLint } from 'eslint';

const harness = vi.hoisted(() => {
    const windows: any[] = [];
    const BrowserWindow: any = vi.fn(function (this: any, opts: any) {
        const listeners = new Map<string, (...a: any[]) => any>();
        const win: any = {
            opts,
            listeners,
            windowOpenHandler: null as null | ((details: any) => any),
            webContents: {
                id: 7,
                on: vi.fn((event: string, fn: any) => { listeners.set(event, fn); }),
                setWindowOpenHandler: vi.fn((fn: any) => { win.windowOpenHandler = fn; }),
                send: vi.fn(),
            },
            on: vi.fn(),
            loadURL: vi.fn(),
            loadFile: vi.fn(),
            show: vi.fn(),
            hide: vi.fn(),
        };
        windows.push(win);
        return win;
    });
    BrowserWindow.getAllWindows = vi.fn(() => windows);
    const shell = { openExternal: vi.fn(async (_url: string) => {}) };
    const dialog: any = {
        showMessageBox: vi.fn(async () => ({ response: 1, checkboxChecked: false })),
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
        showErrorBox: vi.fn(),
    };
    return { windows, BrowserWindow, shell, dialog };
});

vi.mock('electron', async () => {
    const os = await import('node:os');
    return {
        app: {
            getPath: vi.fn(() => os.tmpdir()),
            getName: vi.fn(() => 'sigaa-me-test'),
            setPath: vi.fn(),
            getAppPath: vi.fn(() => '/app'),
            isPackaged: true,
            on: vi.fn(),
            // Dispara o callback na hora: é isso que roda `createWindow()` no import.
            whenReady: vi.fn(() => ({ then: (cb: () => void) => { cb(); } })),
            quit: vi.fn(),
            setLoginItemSettings: vi.fn(),
        },
        BrowserWindow: harness.BrowserWindow,
        ipcMain: { handle: vi.fn() },
        dialog: harness.dialog,
        shell: harness.shell,
        Tray: vi.fn(function () { return { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() }; } as any),
        Menu: { buildFromTemplate: vi.fn(() => ({})) },
    };
});

vi.mock('electron-updater', () => ({
    autoUpdater: {
        autoDownload: true,
        autoInstallOnAppQuit: true,
        on: vi.fn(),
        checkForUpdates: vi.fn(async () => {}),
    },
}));

// A sondagem do Chrome no `whenReady` roda `reg query`/`which` de verdade.
vi.mock('child_process', () => ({ execSync: vi.fn() }));

vi.mock('../../electron/services/persistence.service', () => ({
    persistenceService: {
        getSettings: vi.fn(() => ({ runInBackground: false, syncInterval: 60, openAtLogin: false })),
        saveCredentials: vi.fn(),
        clearCredentials: vi.fn(),
        loadCredentials: vi.fn(() => null),
        applySetting: vi.fn(),
        updateSetting: vi.fn(),
    },
}));
vi.mock('../../electron/services/sigaa.service', () => ({
    SigaaService: vi.fn(function () { return { logout: vi.fn(async () => {}) }; } as any),
}));
vi.mock('../../electron/services/background-sync.service', () => ({
    BackgroundSyncService: vi.fn(function () { return { start: vi.fn(), restart: vi.fn(), syncNow: vi.fn(async () => {}) }; } as any),
}));
vi.mock('../../electron/services/cache.service', () => ({
    cacheService: { cache: {}, saveCache: vi.fn(), forgetLastFile: vi.fn(() => null) },
}));

import { classifyNavigation, installNavigationGuard } from '../../electron/security/navigation-policy';
import { RENDERER_DIST } from '../../electron/main';

const root = process.cwd();

const DEV_APP = 'http://localhost:5173/';
const FILE_APP = 'file:///C:/Users/aluno/AppData/Local/Programs/SIGAA-ME/resources/app.asar/dist/index.html';

function flush() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// ── 1. classifyNavigation ───────────────────────────────────────────────────
describe('classifyNavigation: só o próprio app navega na janela', () => {
    it.each([
        [`${FILE_APP}#/dashboard`, FILE_APP],
        [`${FILE_APP}?x=1#/course/c1`, FILE_APP],
        [FILE_APP, FILE_APP],
        ['http://localhost:5173/?t=1#/course/c1', DEV_APP],
        // Qualquer caminho do dev server é nosso (HMR, reload).
        ['http://localhost:5173/src/main.ts', DEV_APP],
    ])('in-app: %s (app %s)', (target, appUrl) => {
        expect(classifyNavigation(target, appUrl)).toEqual({ kind: 'in-app' });
    });

    it.each([
        // Outro arquivo local, mesmo diretório ou não: não é o app.
        ['file:///C:/Windows/System32/calc.exe', FILE_APP],
        [FILE_APP.replace('index.html', 'other.html'), FILE_APP],
        // `file:` quando o app roda no dev server.
        [FILE_APP, DEV_APP],
        // Outra porta do localhost não é a nossa origem.
        ['http://localhost:5174/', DEV_APP],
        // Empacotado: nem o dev server é in-app.
        [DEV_APP, FILE_APP],
    ])('blocked (não é o app): %s (app %s)', (target, appUrl) => {
        expect(classifyNavigation(target, appUrl)).toMatchObject({ kind: 'blocked' });
    });
});

describe('classifyNavigation: esquemas e credenciais', () => {
    it.each([
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'blob:file:///7f2a1c3e',
        // http: puro, mesmo em host da allowlist.
        'http://si3.ufc.br/sigaa/verTelaLogin.do',
        'ftp://ufc.br/pub',
        'ms-msdt:/id PCWDiagnostic',
        'about:blank',
        'not a url',
        '',
        // Credencial embutida.
        'https://aluno:senha@si3.ufc.br/sigaa',
        'https://si3.ufc.br@evil.example/',
        'https://:x@github.com/Laginho/SIGAA-ME',
    ])('blocked: %j', (target) => {
        const verdict = classifyNavigation(target, FILE_APP);
        expect(verdict).toMatchObject({ kind: 'blocked' });
        expect(typeof (verdict as { reason: string }).reason).toBe('string');
    });

    it('blocked nunca é confundido com external', () => {
        expect(classifyNavigation('javascript:alert(1)', FILE_APP)).not.toMatchObject({ kind: 'external' });
        expect(classifyNavigation('http://si3.ufc.br/', FILE_APP)).not.toMatchObject({ kind: 'external' });
    });
});

describe('classifyNavigation: allowlist', () => {
    it.each([
        'https://si3.ufc.br/sigaa/verTelaLogin.do',
        'https://www.ufc.br/',
        'https://ufc.br/',
        // O parser já baixa o host para minúsculas; porta não importa.
        'https://SI3.UFC.BR/sigaa',
        'https://si3.ufc.br:8443/sigaa',
        'https://github.com/Laginho/SIGAA-ME',
        'https://github.com/Laginho/SIGAA-ME/releases/latest',
        'https://github.com/Laginho/SIGAA-ME/',
    ])('external trusted: %s', (target) => {
        expect(classifyNavigation(target, FILE_APP)).toEqual({ kind: 'external', trusted: true });
    });

    it.each([
        // Sufixo parecido não é subdomínio.
        'https://si3.ufc.br.evil.example/sigaa',
        'https://ufc.br.evil.example/',
        'https://notufc.br/',
        'https://xufc.br/',
        // GitHub: só o repositório do projeto. `-bench` é outro repositório.
        'https://github.com/Laginho/SIGAA-ME-bench',
        'https://github.com/Laginho/SIGAA-ME-bench/issues',
        'https://github.com/outro/repo',
        'https://github.com/',
        'https://www.github.com/Laginho/SIGAA-ME',
        'https://drive.google.com/file/d/abc/view',
        'https://example.com/aviso',
        // mailto: segue a mesma regra do https fora da allowlist (decisão 2).
        'mailto:professor@ufc.br',
        'mailto:alguem@example.com?subject=Prova',
    ])('external untrusted: %s', (target) => {
        expect(classifyNavigation(target, FILE_APP)).toEqual({ kind: 'external', trusted: false });
    });

    it('a allowlist vale igual quando o app roda no dev server', () => {
        expect(classifyNavigation('https://si3.ufc.br/sigaa', DEV_APP)).toEqual({ kind: 'external', trusted: true });
        expect(classifyNavigation('https://example.com/', DEV_APP)).toEqual({ kind: 'external', trusted: false });
    });
});

// ── 2. installNavigationGuard com fakes ─────────────────────────────────────
function fakeContents() {
    const listeners = new Map<string, (...a: any[]) => any>();
    let openHandler: ((details: any) => any) | null = null;
    const contents: any = {
        on: vi.fn((event: string, fn: any) => { listeners.set(event, fn); return contents; }),
        setWindowOpenHandler: vi.fn((fn: any) => { openHandler = fn; }),
    };
    return {
        contents,
        listeners,
        /** Simula o Electron 30: `details.url` e o `url` posicional (deprecated) carregam a mesma URL. */
        willNavigate(url: string) {
            const event = { url, isSameDocument: false, isMainFrame: true, preventDefault: vi.fn() };
            listeners.get('will-navigate')!(event, url, false, true, 0, 0);
            return event;
        },
        windowOpen(url: string) {
            return openHandler!({ url, frameName: '', features: '', disposition: 'new-window', referrer: { url: '', policy: 'default' } });
        },
    };
}

function fakeDeps(overrides: Partial<{ appUrl: string; confirm: boolean }> = {}) {
    return {
        appUrl: overrides.appUrl ?? FILE_APP,
        openExternal: vi.fn(async (_url: string) => {}),
        confirmExternal: vi.fn(async (_url: string) => overrides.confirm ?? true),
    };
}

describe('installNavigationGuard', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('registra will-navigate e setWindowOpenHandler ao instalar', () => {
        const fake = fakeContents();
        installNavigationGuard(fake.contents, fakeDeps());

        expect(fake.listeners.has('will-navigate')).toBe(true);
        expect(fake.contents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    });

    it('in-app: não previne, não abre, não pergunta', () => {
        const fake = fakeContents();
        const deps = fakeDeps();
        installNavigationGuard(fake.contents, deps);

        const event = fake.willNavigate(`${FILE_APP}#/dashboard`);

        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(deps.openExternal).not.toHaveBeenCalled();
        expect(deps.confirmExternal).not.toHaveBeenCalled();
    });

    it('external trusted: previne a navegação e abre no SO sem perguntar', async () => {
        const fake = fakeContents();
        const deps = fakeDeps();
        installNavigationGuard(fake.contents, deps);

        const url = 'https://si3.ufc.br/sigaa/verTelaLogin.do';
        const event = fake.willNavigate(url);
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(deps.openExternal).toHaveBeenCalledTimes(1);
        expect(deps.openExternal).toHaveBeenCalledWith(url);
        expect(deps.confirmExternal).not.toHaveBeenCalled();
    });

    it('external untrusted + confirmado: previne, pergunta com a URL, depois abre', async () => {
        const fake = fakeContents();
        const deps = fakeDeps({ confirm: true });
        installNavigationGuard(fake.contents, deps);

        const url = 'https://drive.google.com/file/d/abc/view';
        const event = fake.willNavigate(url);
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(deps.confirmExternal).toHaveBeenCalledWith(url);
        expect(deps.openExternal).toHaveBeenCalledWith(url);
        // Ordem: a pergunta vem antes de abrir.
        expect(deps.confirmExternal.mock.invocationCallOrder[0]).toBeLessThan(deps.openExternal.mock.invocationCallOrder[0]);
    });

    it('external untrusted + cancelado: previne, pergunta e não abre', async () => {
        const fake = fakeContents();
        const deps = fakeDeps({ confirm: false });
        installNavigationGuard(fake.contents, deps);

        const event = fake.willNavigate('mailto:professor@ufc.br');
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(deps.confirmExternal).toHaveBeenCalledTimes(1);
        expect(deps.openExternal).not.toHaveBeenCalled();
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,<b>x</b>',
        'blob:file:///7f2a1c3e',
        'file:///C:/Windows/System32/calc.exe',
        'http://si3.ufc.br/sigaa',
        'https://aluno:senha@si3.ufc.br/sigaa',
    ])('blocked %s: previne e nem pergunta nem abre', async (url) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fake = fakeContents();
        const deps = fakeDeps();
        installNavigationGuard(fake.contents, deps);

        const event = fake.willNavigate(url);
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(deps.confirmExternal).not.toHaveBeenCalled();
        expect(deps.openExternal).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it.each([
        `${FILE_APP}#/dashboard`,
        'https://si3.ufc.br/sigaa',
        'https://example.com/',
        'javascript:alert(1)',
        'about:blank',
    ])('window.open(%s) é negado e nunca vai ao SO', async (url) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fake = fakeContents();
        const deps = fakeDeps();
        installNavigationGuard(fake.contents, deps);

        expect(fake.windowOpen(url)).toEqual({ action: 'deny' });
        await flush();
        expect(deps.openExternal).not.toHaveBeenCalled();
        expect(deps.confirmExternal).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('openExternal rejeitando não vira unhandled rejection: é logado', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fake = fakeContents();
        const deps = fakeDeps();
        deps.openExternal.mockRejectedValue(new Error('sem navegador'));
        installNavigationGuard(fake.contents, deps);

        fake.willNavigate('https://si3.ufc.br/sigaa');
        await flush();
        await flush();

        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('confirmExternal rejeitando não vira unhandled rejection e não abre', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const fake = fakeContents();
        const deps = fakeDeps();
        deps.confirmExternal.mockRejectedValue(new Error('dialog fechado'));
        installNavigationGuard(fake.contents, deps);

        fake.willNavigate('https://example.com/');
        await flush();
        await flush();

        expect(deps.openExternal).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});

// ── 3. main.ts: a janela real recebe a política ─────────────────────────────
describe('main.ts: createWindow instala a política', () => {
    const win = () => harness.windows[0];

    beforeEach(() => {
        harness.shell.openExternal.mockClear();
        harness.dialog.showMessageBox.mockReset();
        harness.dialog.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false });
    });

    it('cria uma única BrowserWindow com os quatro flags explícitos', () => {
        expect(harness.BrowserWindow).toHaveBeenCalledTimes(1);
        const prefs = win().opts.webPreferences;
        expect(prefs).toMatchObject({
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
        });
        expect(prefs.preload).toMatch(/preload\.mjs$/);
    });

    it('registra will-navigate e setWindowOpenHandler no webContents da janela', () => {
        expect(win().listeners.has('will-navigate')).toBe(true);
        expect(win().webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
        expect(typeof win().windowOpenHandler).toBe('function');
    });

    it('window.open é negado', () => {
        expect(win().windowOpenHandler({ url: 'https://si3.ufc.br/sigaa', frameName: '', features: '', disposition: 'new-window' }))
            .toEqual({ action: 'deny' });
        expect(harness.shell.openExternal).not.toHaveBeenCalled();
    });

    function navigate(url: string) {
        const event = { url, isSameDocument: false, isMainFrame: true, preventDefault: vi.fn() };
        win().listeners.get('will-navigate')!(event, url, false, true, 0, 0);
        return event;
    }

    it('recarregar o próprio index.html não é bloqueado', () => {
        const own = `${pathToFileURL(path.join(RENDERER_DIST, 'index.html')).href}#/dashboard`;
        const event = navigate(own);
        expect(event.preventDefault).not.toHaveBeenCalled();
        expect(harness.shell.openExternal).not.toHaveBeenCalled();
        expect(harness.dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('link ufc.br: a janela não navega, shell.openExternal recebe a URL, sem dialog', async () => {
        const url = 'https://si3.ufc.br/sigaa/verTelaLogin.do';
        const event = navigate(url);
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(harness.shell.openExternal).toHaveBeenCalledWith(url);
        expect(harness.dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it('link https fora da allowlist: dialog nomeia o host; cancelar não abre, botão 0 abre', async () => {
        const url = 'https://example.com/aviso';

        const cancelled = navigate(url);
        await flush();
        expect(cancelled.preventDefault).toHaveBeenCalledTimes(1);
        expect(harness.dialog.showMessageBox).toHaveBeenCalledTimes(1);
        // Primeiro argumento é a janela dona do dialog; as opções precisam
        // dizer para onde o link vai.
        const [owner, options] = harness.dialog.showMessageBox.mock.calls[0];
        expect(owner).toBe(win());
        expect(JSON.stringify(options)).toContain('example.com');
        expect(harness.shell.openExternal).not.toHaveBeenCalled();

        harness.dialog.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
        navigate(url);
        await flush();
        expect(harness.dialog.showMessageBox).toHaveBeenCalledTimes(2);
        expect(harness.shell.openExternal).toHaveBeenCalledTimes(1);
        expect(harness.shell.openExternal).toHaveBeenCalledWith(url);
    });

    it.each([
        'javascript:alert(1)',
        'file:///C:/Windows/System32/calc.exe',
        'data:text/html,<b>x</b>',
    ])('%s: previne, sem dialog e sem openExternal', async (url) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const event = navigate(url);
        await flush();

        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(harness.dialog.showMessageBox).not.toHaveBeenCalled();
        expect(harness.shell.openExternal).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});

// ── 4. ESLint: zona de fronteira ────────────────────────────────────────────
describe('zona de fronteira do ESLint', () => {
    it('cobre electron/security/ (as any vira no-restricted-syntax)', async () => {
        const eslint = new ESLint({ cwd: root });
        const probePath = path.join(root, 'electron/security/_probe.ts');
        const [result] = await eslint.lintText('const x = y as any', { filePath: probePath });
        const msgs = result.messages.filter(m => m.ruleId === 'no-restricted-syntax');
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });
});
