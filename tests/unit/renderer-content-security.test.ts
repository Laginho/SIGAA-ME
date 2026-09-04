// @vitest-environment jsdom
/**
 * SEC-001: renderer content security.
 *
 * Five describes:
 *   1. ESLint `no-restricted-syntax` rule (noUnsafeInnerHtml / noOtherHtmlSinks)
 *   2. CSP meta in index.html
 *   3. Inline handler alarm (textual)
 *   4. Dashboard: no executable nodes, literal textContent, listener navigation
 *   5. Course-detail: no executable nodes, literal text, round-trip fileName,
 *      sanitized-on-write and sanitized-on-read news modal
 *
 * Everything that asserts on a not-yet-existing production behaviour fails red
 * today. The lint cases fail because the rule does not exist yet; CSP fails
 * because there is no meta; the dashboard/course-detail node assertions fail
 * because current code interpolates untrusted data into innerHTML.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ESLint } from 'eslint';
import { ok } from '../../shared/errors';

const root = process.cwd();

function flushAll() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// ── 1. ESLint no-restricted-syntax ──────────────────────────
describe('no-restricted-syntax: innerHTML apenas com literal ou sanitizeNewsHtml', () => {
    const lint = async (code: string, filePath: string) => {
        const eslint = new ESLint({ cwd: root });
        const [result] = await eslint.lintText(code, { filePath });
        return result.messages.filter(m => m.ruleId === 'no-restricted-syntax');
    };
    const probePath = path.join(root, 'src/pages/_probe.ts');

    it('rejeita innerHTML com template interpolado no src/', async () => {
        const msgs = await lint('el.innerHTML = `<b>${x}</b>`', probePath);
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });

    it('aceita innerHTML com literal de aspas simples', async () => {
        const msgs = await lint("el.innerHTML = '<div/>'", probePath);
        expect(msgs).toEqual([]);
    });

    it('aceita innerHTML com template literal sem interpolação', async () => {
        const msgs = await lint('el.innerHTML = `<div></div>`', probePath);
        expect(msgs).toEqual([]);
    });

    it('aceita innerHTML cujo RHS é a chamada ao sanitizador', async () => {
        const msgs = await lint('el.innerHTML = sanitizeNewsHtml(x)', probePath);
        expect(msgs).toEqual([]);
    });

    it('rejeita innerHTML com variável crua', async () => {
        const msgs = await lint('el.innerHTML = x', probePath);
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });

    it('rejeita innerHTML com concatenação de strings', async () => {
        const msgs = await lint('el.innerHTML = a + b', probePath);
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });

    it('rejeita insertAdjacentHTML com dado', async () => {
        const msgs = await lint("el.insertAdjacentHTML('beforeend', x)", probePath);
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });

    it('rejeita atribuição a outerHTML', async () => {
        const msgs = await lint('el.outerHTML = x', probePath);
        expect(msgs.length).toBeGreaterThanOrEqual(1);
    });

    it('não aplica a regra fora da zona src/', async () => {
        const electronPath = path.join(root, 'electron/_probe.ts');
        const msgs = await lint('el.innerHTML = `<b>${x}</b>`', electronPath);
        expect(msgs.length).toBe(0);
    });
});

// ── 2. CSP meta ─────────────────────────────────────────────
describe('CSP meta no index.html', () => {
    let cspContent: string;
    beforeEach(() => {
        const html = readFileSync(path.join(root, 'index.html'), 'utf8');
        const match = html.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"[^>]*>/i)
            || html.match(/<meta[^>]*content="([^"]+)"[^>]*http-equiv="Content-Security-Policy"[^>]*>/i);
        cspContent = match ? match[1] : '';
    });

    it('existe a diretiva script-src', () => {
        expect(cspContent).toMatch(/script-src/);
    });

    it('script-src contém \'self\'', () => {
        const directive = cspContent.split(';').find(d => d.trim().startsWith('script-src'));
        expect(directive).toContain("'self'");
    });

    it('script-src e default-src não contêm unsafe-inline nem unsafe-eval', () => {
        const scriptSrc = cspContent.split(';').find(d => d.trim().startsWith('script-src')) || '';
        const defaultSrc = cspContent.split(';').find(d => d.trim().startsWith('default-src')) || '';
        expect(scriptSrc + defaultSrc).not.toMatch(/unsafe-inline|unsafe-eval/);
    });

    it('objeto object-src \'none\' e base-uri \'none\'', () => {
        expect(cspContent).toMatch(/object-src\s+'none'/);
        expect(cspContent).toMatch(/base-uri\s+'none'/);
    });
});

// ── 3. Inline handler alarm ─────────────────────────────────
describe('sem handlers inline em src/ e index.html', () => {
    function collectSourceFiles(dir: string): string[] {
        return readdirSync(dir).flatMap(entry => {
            const full = path.join(dir, entry);
            if (statSync(full).isDirectory()) return collectSourceFiles(full);
            return full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : [];
        });
    }

    it('nenhum on(click|error|load|mouse*|focus|blur|change|submit)= em arquivo .ts de src/', () => {
        const offenders = collectSourceFiles(path.join(root, 'src'))
            .filter(f => f.includes(`${path.sep}src${path.sep}`) || f.includes(`${path.sep}src${path.sep}pages${path.sep}`))
            .filter(f => !f.includes(path.join('src', 'styles')))
            .filter(f => readFileSync(f, 'utf8').match(/\son(click|error|load|mouse\w+|focus|blur|change|submit)\s*=/i));
        expect(offenders).toEqual([]);
    });

    it('index.html não tem on(click|error|load|mouse*)= inline', () => {
        const html = readFileSync(path.join(root, 'index.html'), 'utf8');
        expect(html).not.toMatch(/\son(click|error|load|mouse\w+|focus|blur|change|submit)\s*=/i);
    });
});

// ── 4. Dashboard ────────────────────────────────────────────
describe('dashboard: conteúdo do SIGAA não cria nó executável', () => {
    const baseSettings = {
        theme: 'light',
        autoSync: false,
        lastDownloadPath: null,
        runInBackground: false,
        syncInterval: 60,
        autoDownloadUpdates: false,
        lastBackgroundSync: null,
        openAtLogin: false,
    };

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
        localStorage.removeItem('notificationsHistory');
        localStorage.removeItem('readItems');
    });

    function setupApi() {
        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ ...baseSettings }),
            onBackgroundSyncUpdate: vi.fn(() => () => undefined),
            logout: vi.fn().mockResolvedValue({ success: true }),
            clearAllData: vi.fn().mockResolvedValue({ success: true }),
        };
    }

    it('não cria img/script/iframe nem handlers inline a partir de dados maliciosos', async () => {
        localStorage.setItem('coursesWithFiles', JSON.stringify([{
            id: "c1' onclick='alert(1)",
            name: '<b>Cálculo</b><script>alert(1)</script>',
            code: '<iframe src=x>',
            period: '<img src=x onerror=alert(1)>',
            fileCount: 0,
            files: [],
            news: [],
        }]));
        setupApi();
        const app = document.createElement('div');
        document.body.appendChild(app);

        const { renderDashboardPage } = await import('../../src/pages/dashboard');
        renderDashboardPage(app as HTMLDivElement, { name: 'ALUNO <img src=x onerror=alert(1)>', photoUrl: 'javascript:alert(1)' });
        await flushAll();

        expect(app.querySelectorAll('img, script, iframe, [onclick], [onerror]').length).toBe(0);
        const userName = app.querySelector('.user-name');
        expect(userName?.textContent).toContain('<img');
        const cardTitle = app.querySelector('.course-card h3');
        expect(cardTitle?.textContent).toBe('<b>Cálculo</b><script>alert(1)</script>');

        const card = app.querySelector('.course-card') as HTMLElement;
        card?.click();
        // jsdom percent-encode espaço no hash (%20); decode compara o id literal.
        expect(decodeURI(window.location.hash)).toBe(`#/course/${"c1' onclick='alert(1)"}`);
    });

    it('permite a foto do perfil quando a URL vem do allowlist si3.ufc.br', async () => {
        localStorage.setItem('coursesWithFiles', JSON.stringify([]));
        setupApi();
        const app = document.createElement('div');
        document.body.appendChild(app);

        const { renderDashboardPage } = await import('../../src/pages/dashboard');
        renderDashboardPage(app as HTMLDivElement, { name: 'ALUNO', photoUrl: 'https://si3.ufc.br/sigaa/foto.jpg' });
        await flushAll();

        const img = app.querySelector('img.user-photo') as HTMLImageElement | null;
        expect(img).not.toBeNull();
        expect(img?.getAttribute('src')).toBe('https://si3.ufc.br/sigaa/foto.jpg');
    });

    it('linhas de notificação exibem literal e criam nenhum nó executável', async () => {
        localStorage.setItem('coursesWithFiles', JSON.stringify([]));
        setupApi();
        const app = document.createElement('div');
        document.body.appendChild(app);

        const { renderDashboardPage } = await import('../../src/pages/dashboard');
        const { pushNotifications } = await import('../../src/utils/notification-store');
        pushNotifications([{
            id: 'news-c1-n1',
            type: 'news',
            courseId: 'c1',
            courseName: '<svg onload=alert(1)>',
            itemId: 'n1',
            itemTitle: '<img src=x onerror=alert(1)>',
            timestamp: Date.now(),
            read: false,
        }]);

        renderDashboardPage(app as HTMLDivElement, { name: 'ALUNO' });
        await flushAll();

        const bell = document.getElementById('notificationBellBtn') as HTMLButtonElement;
        bell?.click();
        await flushAll();

        const list = document.getElementById('notificationList');
        expect(list?.querySelectorAll('img, svg, script, iframe, [onerror], [onload]').length).toBe(0);
        const title = list?.querySelector('.notification-item-title');
        expect(title?.textContent).toBe('<img src=x onerror=alert(1)>');
    });
});

// ── 5. Course-detail ────────────────────────────────────────
describe('course-detail: conteúdo do SIGAA não cria nó executável, sanitiza na escrita e na leitura', () => {
    const MALICIOUS = '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">j</a><a href="https://si3.ufc.br/">s</a>';
    const baseSettings = {
        theme: 'light',
        autoSync: false,
        lastDownloadPath: 'C:/Users/aluno/SIGAA',
        runInBackground: false,
        syncInterval: 60,
        autoDownloadUpdates: false,
        openAtLogin: false,
    };

    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
        localStorage.removeItem('notificationsHistory');
        localStorage.removeItem('readItems');
    });

    function setupCache(courseOverrides: Record<string, unknown> = {}) {
        localStorage.setItem('coursesWithFiles', JSON.stringify([{
            id: 'c1',
            name: 'Cálculo I',
            code: 'CB0001',
            news: [{
                id: 'n1',
                title: '<img src=x onerror=alert(1)>',
                date: '01/01/2026',
                notification: 'Sim',
                content: MALICIOUS,
            }],
            files: [{
                id: '1',
                type: 'file',
                name: '"><img src=x onerror=alert(1)>.pdf',
            }],
            ...courseOverrides,
        }]));
    }

    function setupApi() {
        (window as any).api = {
            getSettings: vi.fn().mockResolvedValue({ ...baseSettings }),
            onDownloadProgress: vi.fn(() => () => undefined),
            checkFilesExistence: vi.fn().mockResolvedValue(ok([])),
            downloadFile: vi.fn().mockResolvedValue({ success: false, error: { code: 'SESSION_EXPIRED', message: 'x' } }),
            selectDownloadFolder: vi.fn(),
            getNewsDetail: vi.fn().mockResolvedValue({ success: true, data: { title: 'T', date: 'D', notification: '', content: MALICIOUS } }),
        };
    }

    it('não cria img/script/iframe, exibe título e nome literal, mantém dataset round-trip', async () => {
        setupCache();
        setupApi();
        const container = document.createElement('div');
        document.body.appendChild(container);

        const { renderCourseDetailPage } = await import('../../src/pages/course-detail');
        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        expect(container.querySelectorAll('img, script, iframe, [onerror], [onclick]').length).toBe(0);
        expect(container.querySelector('.news-title')?.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(container.querySelector('.file-name')?.textContent).toBe('"><img src=x onerror=alert(1)>.pdf');

        const downloadBtn = container.querySelector('.btn-download-file') as HTMLElement | null;
        expect(downloadBtn?.dataset.fileName).toBe('"><img src=x onerror=alert(1)>.pdf');
        expect(downloadBtn?.dataset.fileId).toBe('1');

        // Modal sanitizes on read
        const newsItem = container.querySelector('.news-item') as HTMLElement;
        newsItem?.click();
        await flushAll();
        await flushAll();

        const modalBody = container.querySelector('#modalBody .modal-body') as HTMLElement | null;
        expect(modalBody?.querySelector('p')).not.toBeNull();
        const safeLink = modalBody?.querySelector('a[href^="https://"]');
        expect(safeLink).not.toBeNull();
        expect(safeLink?.getAttribute('rel') || '').toContain('noopener');
        expect(modalBody?.querySelector('a[href^="javascript"]')).toBeNull();
        expect(modalBody?.querySelectorAll('script, img, [onerror]').length).toBe(0);
        expect(container.querySelector('.modal-title')?.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('sanitiza na escrita no cache e na leitura no modal quando content vem via getNewsDetail', async () => {
        setupCache({ news: [{ id: 'n1', title: 'T', date: 'D', notification: '', /* no content */ }] });
        setupApi();
        // Ver notícia não é sync: o rótulo "Sync manual" do dashboard lê cacheTimestamp.
        localStorage.setItem('cacheTimestamp', '111');
        const container = document.createElement('div');
        document.body.appendChild(container);

        const { renderCourseDetailPage } = await import('../../src/pages/course-detail');
        renderCourseDetailPage(container, 'c1');
        for (let i = 0; i < 10; i++) await flushAll();

        const newsItem = container.querySelector('.news-item') as HTMLElement;
        newsItem?.click();
        await flushAll();

        const modalBody = container.querySelector('#modalBody .modal-body') as HTMLElement | null;
        expect(modalBody?.querySelectorAll('script, img, [onerror]').length).toBe(0);

        const stored = JSON.parse(localStorage.getItem('coursesWithFiles') || '[]');
        const storedContent = stored[0].news[0].content as string;
        expect(storedContent).not.toContain('<script');
        expect(storedContent).not.toContain('onerror');
        expect(localStorage.getItem('cacheTimestamp')).toBe('111');
    });
});
