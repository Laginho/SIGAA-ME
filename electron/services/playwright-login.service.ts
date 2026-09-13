import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { app } from 'electron';
import { logger } from './logger.service';
import { buildStructuralDiagnostic, diagnosticsService, shouldCaptureRawArtifact } from './diagnostics.service';
import type { NewsDetail } from '../../shared/domain';
import type { AppErrorCode } from '../../shared/errors';
import { COURSE_HOME, FILES_MENU, LOGIN, NEWS, STUDENT_HOME, STUDENT_PORTAL, newsFormSelector } from '../sigaa/selectors';
import {
    classifyLoginEnd,
    classifyLoginException,
    describeMissingCourseListSelectors,
    isLoginDocument,
    validateCourseListDocument,
    validateLoginStart,
    PORTAL_ADAPTER_VERSION
} from '../sigaa/portal-adapter';

const log = logger.scope('PlaywrightLogin');

/**
 * Linha da lista de turmas como o portal a entrega. `href`/`onclick` são
 * internos do JSF e **não** atravessam o IPC: `SigaaService` reduz isto a
 * `CourseSummary` (shared/domain.ts).
 */
export interface ParsedCourse {
    id: string;
    code: string;
    name: string;
    period: string;
    href: string | null;
    onclick: string | null;
}

/**
 * Decides whether the loaded turma virtual page belongs to the expected course,
 * given the text of its `#nomeTurma` header (e.g. "TI0116 - SINAIS E SISTEMAS
 * (2026.1 - T01)").
 *
 * The check MUST be scoped to that header: every turma page also embeds a
 * hidden "Escolha uma Turma" panel listing ALL of the student's courses, so
 * searching the whole page for the course name passes even when the JSF
 * session served the wrong course — that was how one course's files and news
 * got attributed to another after a silently failed course click.
 */
export function isExpectedCoursePage(nomeTurmaText: string, courseName: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const header = normalize(nomeTurmaText);
    return header.length > 0 && header.includes(normalize(courseName));
}

/**
 * Uses Playwright to automate a real browser for UFC SIGAA login.
 * This handles all the complexity that the HTTP approach couldn't solve.
 */
export class PlaywrightLoginService {
    private browser: Browser | null = null;
    private storedCookies: any[] = [];
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    // Store credentials for automatic re-login when session expires
    private storedUsername: string | null = null;
    private storedPassword: string | null = null;

    /**
     * Best-effort (PORTAL-003): um diagnóstico que falha não pode alterar o
     * erro que ele descreve. Sem a guarda, um EPERM aqui cai no `catch`
     * genérico do método chamador, que devolve o erro sem `errorCode` — e o
     * `SELECTOR_DRIFT` que o diagnóstico existe para explicar desaparece.
     */
    private recordDiagnostic(html: string, url: string, selectorCounts: Record<string, number>): void {
        try {
            diagnosticsService.record(buildStructuralDiagnostic(html, url, PORTAL_ADAPTER_VERSION, selectorCounts));
        } catch (error) {
            log.error('Playwright: failed to record structural diagnostic.', { error });
        }
    }

    async login(username: string, password: string): Promise<{ success: boolean; cookies?: any[]; userName?: string; photoUrl?: string; error?: string; errorCode?: AppErrorCode }> {
        // Declarado fora do try (PORTAL-003): o catch precisa da página para
        // capturar HTML/URL best-effort quando a exceção é SELECTOR_DRIFT, e
        // uma `const` dentro do try não alcança o catch.
        let page: Page | null = null;
        try {
            log.info('Playwright: Launching browser...');

            // A previous browser may still be running (earlier sync or login).
            // Launching over it leaks the whole Chrome process tree.
            await this.close();

            this.browser = await chromium.launch({
                channel: 'chrome',
                headless: true
            });

            const context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            });
            page = await context.newPage();

            log.info('Playwright: Navigating to login page...');
            await page.goto(LOGIN.url);

            // Validar o documento inicial antes de preencher qualquer campo — o
            // reconhecimento é sempre pelo formulário, nunca pela URL isolada.
            const startHtml = await page.content();
            const startCheck = validateLoginStart(startHtml);
            if (startCheck) {
                if (startCheck.code === 'SELECTOR_DRIFT') {
                    this.recordDiagnostic(startHtml, page.url(), {});
                }
                await this.close();
                return { success: false, error: startCheck.message, errorCode: startCheck.code };
            }

            log.info('Playwright: Filling in credentials...');
            await page.fill(LOGIN.username, username);
            await page.fill(LOGIN.password, password);

            log.info('Playwright: Clicking login button...');
            await page.click(LOGIN.submit);

            // Wait for navigation after login
            log.info('Playwright: Waiting for navigation...');
            await page.waitForLoadState('networkidle');

            const currentUrl = page.url();
            log.info(`Playwright: Current URL after login: ${currentUrl}`);

            // Validar o documento final: só um pouso reconhecido (home ou portal)
            // autentica. Nem a URL ter deixado de ser a de login, nem um
            // `#conteudo` isolado, provam a transição.
            const endHtml = await page.content();
            const endState = classifyLoginEnd(endHtml);

            if (endState === 'still-login') {
                const errorElement = await page.$(LOGIN.errorMessage);
                const errorMessage = errorElement ? await errorElement.textContent() : 'Unknown error';

                await this.close();
                return { success: false, error: errorMessage || 'Login failed - still on login page', errorCode: 'SESSION_EXPIRED' };
            }
            if (endState === 'unrecognized') {
                this.recordDiagnostic(endHtml, currentUrl, {});
                await this.close();
                return {
                    success: false,
                    errorCode: 'SELECTOR_DRIFT',
                    error: `SIGAA login selector drift: the page after login was neither the login form nor a recognized student home/portal. Current URL: ${currentUrl}`
                };
            }

            // Login successful! Extract user data from the page
            log.info('Playwright: Login successful! Extracting user data...');

            // DEBUG: Save login page HTML for selector inspection (dev only)
            diagnosticsService.saveRaw('debug_login_page.html', endHtml);

            // Stay on current page after login to extract user info
            const nameElement = await page.$(LOGIN.userNameFallback);
            const userName = nameElement ? await nameElement.textContent() : null;

            // Note: Photo is only available on portal page, not login page
            // Will extract it during getCourses instead
            const photoUrl: string | null = null;

            log.info('Playwright: Extracted user name.', { name: userName });
            log.info('Playwright: Photo will be extracted from portal page during sync.');

            // Extract cookies
            const cookies = await context.cookies();
            log.info('Playwright: Found cookies.', { count: cookies.length, cookies });

            // Store cookies and credentials for future use
            this.storedCookies = cookies;
            this.storedUsername = username;
            this.storedPassword = password;

            this.context = context;
            this.page = page;
            log.info('Playwright: Keeping session alive for cookie refresh.');

            return {
                success: true,
                cookies,
                userName: userName?.trim() || 'User',
                photoUrl: photoUrl || undefined
            };

        } catch (error: any) {
            log.error('Playwright: Error during login.', { error });
            const classified = classifyLoginException(error);
            // Sessão vencida (SESSION_EXPIRED) e portal fora do ar
            // (PORTAL_UNAVAILABLE) não são mudança de layout — só drift real
            // grava. A própria captura de HTML/URL pode lançar (página já
            // fechada); isso não pode escapar do login() nem apagar o
            // errorCode classificado.
            if (classified.errorCode === 'SELECTOR_DRIFT' && page) {
                try {
                    const html = await page.content();
                    this.recordDiagnostic(html, page.url(), {});
                } catch (captureError) {
                    log.error('Playwright: failed to capture diagnostic HTML after login exception.', { error: captureError });
                }
            }
            await this.close();
            return { success: false, error: classified.message, errorCode: classified.errorCode };
        }
    }

    async forceReset() {
        if (this.context) {
            log.info('Playwright: Force resetting context (Abort Navigation)...');
            try {
                await this.context.close();
            } catch (e) {
                log.error('Playwright: Error closing context during reset.', { error: e });
            }
            this.context = null;
            this.page = null;
        }
    }

    /**
     * Re-login using stored credentials when session expires
     */
    async reloginWithStoredCredentials(): Promise<{ success: boolean; cookies?: any[]; error?: string }> {
        if (!this.storedUsername || !this.storedPassword) {
            return { success: false, error: 'No stored credentials available' };
        }

        log.info('Playwright: Attempting re-login with stored credentials...');

        // Close existing browser to start fresh
        await this.close();

        // Perform login with stored credentials
        const result = await this.login(this.storedUsername, this.storedPassword);

        return {
            success: result.success,
            cookies: result.cookies,
            error: result.error
        };
    }

    /**
 * Get fresh cookies from the live Playwright session
 */
    async getCookies(): Promise<any[]> {
        if (!this.context) {
            log.warn('Playwright: No active context, returning stored cookies.');
            return this.storedCookies || [];
        }
        try {
            const cookies = await this.context.cookies();
            this.storedCookies = cookies;
            log.info('Playwright: Refreshed cookies.');
            return cookies;
        } catch (error) {
            log.error('Playwright: Error getting cookies.', { error });
            return this.storedCookies || [];
        }
    }

    async getCourses(): Promise<{ success: boolean; courses?: ParsedCourse[]; photoUrl?: string; error?: string; errorCode?: AppErrorCode }> {
        try {
            log.info('Playwright: Launching browser to fetch courses...');

            // Check if we have stored cookies
            if (!this.storedCookies || this.storedCookies.length === 0) {
                return { success: false, error: 'No stored session - please login first', errorCode: 'SESSION_EXPIRED' };
            }

            // A previous browser may still be running (earlier sync or login).
            // Launching over it leaks the whole Chrome process tree.
            await this.close();

            this.browser = await chromium.launch({
                channel: 'chrome',
                headless: true
            });

            const context = await this.browser.newContext();

            // Inject stored cookies
            log.info('Playwright: Injecting stored session cookies...');
            await context.addCookies(this.storedCookies);

            const page = await context.newPage();

            // Enable console logs from the browser to Node.js
            page.on('console', msg => log.info('Playwright: Browser console message.', { body: msg.text() }));

            // Start at home page
            log.info('Playwright: Navigating to home page...');
            await page.goto('https://si3.ufc.br/sigaa/paginaInicial.do');
            await page.waitForLoadState('networkidle');

            // Check if we got redirected to login (cookies expired). Reconhecimento
            // pelo documento, não pela URL — o mock de teste só expõe content()/url().
            if (isLoginDocument(await page.content())) {
                await this.close();
                return { success: false, error: 'Session expired - please login again', errorCode: 'SESSION_EXPIRED' };
            }

            // Click on student portal link
            log.info('Playwright: Looking for "Menu Discente" link...');
            try {
                // Click on "Menu Discente" link using exact href - use .first() to avoid strict mode error
                const studentLink = page.locator(STUDENT_HOME.menuDiscenteLink).first();
                await studentLink.click({ timeout: 5000 });
                await page.waitForLoadState('networkidle');
                log.info(`Playwright: Clicked Menu Discente. Current URL: ${page.url()}`);
            } catch (clickError) {
                log.warn('Playwright: Auto-click failed.', { error: clickError });
                log.info(`Playwright: Current URL: ${page.url()}`);
                // Try to navigate directly as fallback
                log.info('Playwright: Trying direct navigation to verPortalDiscente.do...');
                await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
                await page.waitForLoadState('networkidle');
            }

            // Wait a bit for dynamic content
            await page.waitForTimeout(1000);

            // DEBUG: Save portal page HTML for professor selector inspection (dev only).
            // Guarda de exceção ao critério 6 do OBS-003: aqui, diferente dos outros
            // dumps, o fetch de `page.content()` só existe para o dump — gatear antes
            // dele evita um round-trip a mais no Chromium quando o resultado seria
            // descartado, e preserva a contagem de chamadas de
            // `portal-selector-resilience.test.ts` (fora do escopo desta ticket).
            if (shouldCaptureRawArtifact(app.isPackaged, false)) {
                const portalHtml = await page.content().catch(() => '');
                if (portalHtml) diagnosticsService.saveRaw('debug_portal_page.html', portalHtml);
            }

            // Extract courses with robust selector-based logic
            log.info('Playwright: Extracting courses from page...');
            const courseExtraction = await page.evaluate((sel) => {
                const results: ParsedCourse[] = [];
                // Find all rows that might contain courses
                const rows = document.querySelectorAll('tr');

                for (const row of rows) {
                    // Look for the hidden ID input and the course link
                    const idInput = row.querySelector(sel.courseIdInput) as HTMLInputElement;
                    const nameLink = row.querySelector(sel.virtualClassroomLink);
                    const periodCell = row.querySelector('td.info center'); // Period is often in a center tag

                    if (idInput && nameLink && nameLink.textContent) {
                        const fullText = nameLink.textContent.trim();
                        const id = idInput.value;

                        // Course codes follow pattern: 2 letters + 4 digits (e.g., CB0699, CK0181)
                        // Format usually: "CODE - NAME"
                        const parts = fullText.split(' - ');

                        if (parts.length >= 2) {
                            results.push({
                                id: id,
                                code: parts[0].trim(),
                                name: parts.slice(1).join(' - ').trim(),
                                period: periodCell ? (periodCell as HTMLElement).innerText.split('\n')[0] : '',
                                href: nameLink.getAttribute('href'),
                                onclick: nameLink.getAttribute('onclick')
                                // Note: Professor name is not available in portal list view
                            });
                        }
                    }
                }

                return {
                    courses: results,
                    selectorDiagnostics: {
                        courseIdInputs: document.querySelectorAll(sel.courseIdInput).length,
                        virtualClassroomLinks: document.querySelectorAll(sel.virtualClassroomLink).length
                    }
                };
            }, { courseIdInput: STUDENT_PORTAL.courseIdInput, virtualClassroomLink: STUDENT_PORTAL.virtualClassroomLink });

            const { courses, selectorDiagnostics } = courseExtraction;
            if (selectorDiagnostics.courseIdInputs === 0 || selectorDiagnostics.virtualClassroomLinks === 0) {
                this.recordDiagnostic(
                    await page.content().catch(() => ''),
                    page.url(),
                    selectorDiagnostics
                );
                await this.close();
                return {
                    success: false,
                    errorCode: 'SELECTOR_DRIFT',
                    error: describeMissingCourseListSelectors(selectorDiagnostics.courseIdInputs, selectorDiagnostics.virtualClassroomLinks)
                };
            }

            log.info(`Playwright: Found ${courses.length} courses.`);

            // Save to debug file for analysis (dev only)
            diagnosticsService.saveRaw('debug_courses.json', JSON.stringify(courses, null, 2));

            if (courses.length > 0) {
                log.info('Playwright: Sample courses.', { courses: courses.slice(0, 3) });
            }

            // Extract user photo from portal page
            const photoElement = await page.$('.foto img, div.foto img');
            let photoUrl = photoElement ? await photoElement.getAttribute('src') : null;
            if (photoUrl && !photoUrl.startsWith('http')) {
                photoUrl = `https://si3.ufc.br${photoUrl}`;
            }
            log.info('Playwright: Extracted photo URL from portal.', { url: photoUrl });

            // DO NOT CLOSE BROWSER HERE - Keep it alive for course entry
            // await this.close(); 

            // Store the page/context for reuse
            this.context = context;
            this.page = page;

            return { success: true, courses, photoUrl: photoUrl || undefined };

        } catch (error: any) {
            log.error('Playwright: Error fetching courses.', { error });
            await this.close();
            return { success: false, error: error.message };
        }
    }

    async enterCourseAndGetHTML(courseId: string, courseName: string): Promise<{ success: boolean; html?: string; cookies?: any[]; error?: string; errorCode?: AppErrorCode }> {
        try {
            if (!this.browser || !this.context) {
                // If browser is closed, relaunch it
                log.info('Playwright: Browser not active, relaunching...');
                await this.getCourses(); // This will relaunch and set this.context
            }

            // IMPORTANT: Reuse the existing page instead of creating a new one
            // Creating a new page causes "Acesso Negado" (Access Denied) errors
            // because the portal requires the same page/session state
            if (!this.page || this.page.isClosed()) {
                log.info('Playwright: No existing page, creating new one from context...');
                this.page = await this.context!.newPage();
            }

            const page = this.page;

            // Always force navigation to portal to ensure clean state
            log.info('Playwright: Navigating to portal for course.', { courseName });

            // Better navigation strategy: Go to Home -> Click Menu Discente
            // This mimics user behavior and avoids "Access Denied" errors
            try {
                await page.goto('https://si3.ufc.br/sigaa/paginaInicial.do');
                await page.waitForLoadState('networkidle');

                // Check if we were redirected to login
                if (page.url().includes('verTelaLogin') || page.url().includes('logar.do')) {
                    log.warn('Playwright: Redirected to login page. Session expired.');
                    // Don't close page - we might need to re-login and reuse it
                    this.page = null;
                    return { success: false, error: 'Session expired - please login again' };
                }

                // Click on "Menu Discente" link
                const studentLink = page.locator(STUDENT_HOME.menuDiscenteLink).first();
                if (await studentLink.isVisible()) {
                    await studentLink.click();
                    await page.waitForLoadState('networkidle');
                } else {
                    // Fallback to direct navigation if link not found
                    log.info('Playwright: Menu Discente link not found, trying direct navigation...');
                    await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
                    await page.waitForLoadState('networkidle');
                }
            } catch (navError) {
                log.error('Playwright: Navigation error.', { error: navError });
                // Last resort fallback
                await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
                await page.waitForLoadState('networkidle');
            }

            // Enter the course
            // Documento inicial antes de clicar: a URL não ser a de login não prova
            // que a sessão vive — o SIGAA devolve o formulário de login na própria
            // paginaInicial.do. Sem esta checagem, sessão expirada saía daqui como
            // "Course link not found in portal", que `classifyMessage` lê como
            // NOT_FOUND, e ninguém tenta relogar.
            const portalHtml = await page.content();
            const portalCheck = validateCourseListDocument(portalHtml);
            if (portalCheck) {
                log.warn(`Playwright: Portal document rejected before course entry: ${portalCheck.code}`);
                if (portalCheck.code === 'SELECTOR_DRIFT') this.recordDiagnostic(portalHtml, page.url(), {});
                if (portalCheck.code === 'SESSION_EXPIRED') this.page = null;
                return { success: false, error: portalCheck.message, errorCode: portalCheck.code };
            }

            log.info('Playwright: Entering course.', { courseId, courseName });
            const entered = await page.evaluate(({ id, sel }) => {
                const inputs = Array.from(document.querySelectorAll(sel.courseIdInput));
                const targetInput = inputs.find(input => (input as HTMLInputElement).value === id);

                if (targetInput) {
                    const row = targetInput.closest('tr');
                    if (row) {
                        const link = row.querySelector(sel.virtualClassroomLink) as HTMLElement;
                        if (link) {
                            link.click();
                            return { success: true };
                        }
                    }
                }
                return { success: false };
            }, { id: courseId, sel: { courseIdInput: STUDENT_PORTAL.courseIdInput, virtualClassroomLink: STUDENT_PORTAL.virtualClassroomLink } });

            if (!entered.success) {
                // Get debug info about what courses ARE on the portal
                const debugInfo = await page.evaluate((courseIdInputSelector) => {
                    const inputs = Array.from(document.querySelectorAll(courseIdInputSelector));
                    return {
                        courseIds: inputs.map(input => (input as HTMLInputElement).value),
                        pageTitle: document.title,
                        bodyText: document.body.innerText.substring(0, 500)
                    };
                }, STUDENT_PORTAL.courseIdInput);

                log.error('Playwright: Course not found in portal.', {
                    courseId,
                    url: page.url(),
                    availableCourseIds: debugInfo.courseIds,
                    title: debugInfo.pageTitle,
                });

                // Save debug HTML
                const html = await page.content();
                diagnosticsService.saveRaw(`debug_portal_fail_${courseId}.html`, html);

                // Don't close page - keep it for potential retry
                return {
                    success: false,
                    error: `Course link not found in portal. Available IDs: ${debugInfo.courseIds.join(', ')}`,
                    errorCode: 'NOT_FOUND'
                };
            }

            if (entered.success) {
                log.info('Playwright: Click processed, waiting for Course Page content...');
                try {
                    // Crucial: Wait for specific text that ONLY appears on the course page
                    await page.waitForSelector('text=Menu Turma Virtual', { timeout: 15000 });
                    log.info('Playwright: Verified we are on Course Page (found "Menu Turma Virtual").');
                } catch (e) {
                    log.warn('Playwright: Timeout waiting for "Menu Turma Virtual". Navigation may have failed or page is slow.');
                    // Don't throw - let it proceed to check URL/content below, but this warns us
                }

                await page.waitForLoadState('networkidle');
                // Wait slightly more for JSF to settle
                await page.waitForTimeout(2000);
            }

            // Navigate to AVA to ensure we are in the course context
            // Note: Clicking the link usually redirects to AVA, but we ensure it here
            if (!page.url().includes('ava/index.jsf')) {
                log.info('Playwright: URL not AVA after click, forcing navigation...');
                await page.goto('https://si3.ufc.br/sigaa/ava/index.jsf');
                await page.waitForLoadState('networkidle');
            }

            // Wait for dynamic content
            await page.waitForTimeout(1000);

            // VERIFY: only the #nomeTurma header identifies the course actually
            // loaded — see isExpectedCoursePage for why the whole page can't be used.
            const nomeTurma = (await page.locator(COURSE_HOME.nomeTurmaSelector).textContent({ timeout: 5000 }).catch(() => '')) ?? '';
            const nomeTurmaClean = nomeTurma.trim().replace(/\s+/g, ' ');
            if (!isExpectedCoursePage(nomeTurma, courseName)) {
                const errorMsg = `Playwright: Course verification failed! Page header shows "${nomeTurmaClean}" instead of "${courseName}" — the JSF session is likely still on the previous course.`;
                log.error('Playwright: Course verification failed.', { courseName, title: nomeTurmaClean });
                throw new Error(errorMsg);
            } else {
                log.info('Playwright: Verified course.', { courseName, title: nomeTurmaClean });
            }


            // Verify we are on the course page
            try {
                await page.waitForSelector('text=Menu Turma Virtual', { timeout: 15000 });
                log.info('Playwright: Verified we are on Course Page (found "Menu Turma Virtual").');
            } catch (e) {
                log.warn('Playwright: Could not verify "Menu Turma Virtual". We might be on the portal or a different page.');
                const content = await page.content();
                if (content.includes(STUDENT_HOME.portalDiscenteText)) {
                    throw new Error('Still on Portal Page after clicking course.');
                }
            }

            return {
                success: true,
                html: await page.content(),
                cookies: await this.context!.cookies()
            };

        } catch (error: any) {
            const html = this.page ? await this.page.content().catch(() => '') : '';
            if (html) diagnosticsService.saveRaw(`debug_playwright_fail_${courseId}.html`, html);
            log.error('Playwright: Error entering course.', { courseId, error });
            // Don't close likely
            return { success: false, error: error.message };
        }
    }

    async navigateToFilesSection(): Promise<{ success: boolean; html?: string; error?: string }> {
        if (!this.browser || !this.page) {
            return { success: false, error: 'Browser not initialized' };
        }
        const page = this.page;

        try {
            log.info('Playwright: Navigating to Files Section (Materiais > Conteúdo)...');

            // 1. First, check if Materiais accordion is closed and needs opening
            const materiaisMenu = page.locator(FILES_MENU.itemMenuHeaderMateriais).first();
            if (await materiaisMenu.isVisible().catch(() => false)) {
                // Check if the accordion content is visible yet
                const contentContainer = materiaisMenu.locator('xpath=following-sibling::div').first();
                if (!(await contentContainer.isVisible().catch(() => false))) {
                    log.info('Playwright: Opening Materiais accordion...');
                    await materiaisMenu.click();
                    await page.waitForTimeout(500); // Wait for open animation
                }
            } else {
                // Maybe it's a direct text 'Materiais'
                const fallbackMateriais = page.locator('text=Materiais').first();
                if (await fallbackMateriais.isVisible().catch(() => false)) {
                    await fallbackMateriais.click();
                    await page.waitForTimeout(500);
                }
            }

            // 2. Use native Playwright locators with regex to bypass encoding issues
            // This natively simulates a real mouse click which ensures JSF form submission triggers correctly
            log.info('Playwright: Looking for Conteúdo link...');
            const conteudoLocator = page.locator(FILES_MENU.conteudoLinkSelector).filter({ hasText: FILES_MENU.conteudoTextPattern }).first();

            if (await conteudoLocator.isVisible().catch(() => false)) {
                log.info('Playwright: Found Conteúdo link, clicking natively...');
                await conteudoLocator.click();
            } else {
                log.warn('Playwright: Could not find Conteúdo link via locators!');
                // Log page state for debugging
                const allMenuText = await page.locator(FILES_MENU.conteudoLinkSelector).allTextContents();
                log.warn('Playwright: Available text contents (truncated).', { body: allMenuText.join(', ').substring(0, 300) });
                return { success: false, error: 'SIGAA selector drift: the "Conteúdo" files navigation link was not found. Open the saved portal diagnostics and update the portal selectors.' };
            }

            // 3. JSF uses AJAX partial updates. networkidle fires too early.
            // Wait for the file download links to appear.
            log.info('Playwright: Waiting for files content to render...');
            try {
                await page.waitForFunction((selector) => {
                    const links = document.querySelectorAll(selector);
                    return links.length > 0;
                }, FILES_MENU.fileLinkReadySelector, { timeout: 8000 });
                log.info('Playwright: Files content detected (found jsfcljs links).');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                log.warn('Playwright: Files content selector timed out.', { error: message });
                return {
                    success: false,
                    error: `SIGAA selector drift: the files section did not render ${FILES_MENU.fileLinkReadySelector} before the timeout. The course layout may have changed. Playwright: ${message}`
                };
            }

            const html = await page.content();
            const title = html.match(/<title>(.*?)<\/title>/i)?.[1] || 'unknown';
            log.info('Playwright: Captured files page HTML.', { title, length: html.length });

            return { success: true, html };

        } catch (error: any) {
            log.error('Playwright: Error navigating to Files Section.', { error });
            return { success: false, error: error.message };
        }
    }


    // Kept for backward compatibility but now unused by the new flow
    private async navigateToCourse(page: any, courseId: string): Promise<boolean> {
        try {
            // Go to portal
            await page.goto('https://si3.ufc.br/sigaa/verPortalDiscente.do');
            await page.waitForLoadState('networkidle');

            // Enter the course
            log.info('Playwright: Entering course.', { courseId });
            const entered = await page.evaluate(({ id, sel }: { id: string; sel: { courseIdInput: string; virtualClassroomLink: string } }) => {
                const inputs = Array.from(document.querySelectorAll(sel.courseIdInput));
                const targetInput = inputs.find(input => (input as HTMLInputElement).value === id);

                if (targetInput) {
                    const row = targetInput.closest('tr');
                    if (row) {
                        const link = row.querySelector(sel.virtualClassroomLink) as HTMLElement;
                        if (link) {
                            link.click();
                            return { success: true };
                        }
                    }
                }
                return { success: false };
            }, { id: courseId, sel: { courseIdInput: STUDENT_PORTAL.courseIdInput, virtualClassroomLink: STUDENT_PORTAL.virtualClassroomLink } });

            if (!entered.success) {
                log.error('Playwright: Course not found in portal.');
                return false;
            }

            await page.waitForLoadState('networkidle');
            // Wait for course selection to register
            await page.waitForTimeout(2000);

            // Navigate to AVA
            await page.goto('https://si3.ufc.br/sigaa/ava/index.jsf');
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            return true;
        } catch (error) {
            log.error('Playwright: Navigation error.', { error });
            return false;
        }
    }

    async downloadFile(
        courseId: string,
        courseName: string,
        fileName: string,
        fileUrl: string,
        basePath: string,
        _downloadedFiles: Record<string, any>,
        script?: string
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        const maxRetries = 1;
        let attempt = 0;

        while (attempt <= maxRetries) {
            let localBrowser: Browser | null = null;
            try {
                const { DownloadService } = await import('./download.service');

                // Launch a dedicated browser for this download to avoid concurrency issues
                localBrowser = await chromium.launch({ channel: 'chrome', headless: false });
                const downloadService = new DownloadService(localBrowser);

                const context = await localBrowser.newContext();
                // Inject stored cookies
                if (this.storedCookies.length > 0) {
                    await context.addCookies(this.storedCookies);
                }

                const page = await context.newPage();

                // If this is a retry due to session timeout, we must force a fresh entry to the course
                if (attempt > 0) {
                    log.info(`Playwright: Single download retry attempt ${attempt}. Forcing course re-entry...`);
                    const enterResult = await this.enterCourseAndGetHTML(courseId, courseName);
                    if (!enterResult.success) {
                        await localBrowser.close();
                        throw new Error('Could not re-enter course for single download retry.');
                    }
                    const freshCookies = await this.context!.cookies();
                    await context.addCookies(freshCookies);
                }

                // Navigate to course page first
                const navigated = await this.navigateToCourse(page, courseId);
                if (!navigated) {
                    await localBrowser.close();
                    return { success: false, error: 'Failed to navigate to course page' };
                }

                // CRITICAL: Navigate to the files/materials section (Materiais > Conteúdo)
                // The AVA homepage (ava/index.jsf) does NOT contain the file download links!
                // They live in the "Conteúdo" sub-page accessible via the sidebar menu.
                log.info('Playwright: Navigating to files section (Conteúdo)...');
                const filesNavSuccess = await page.evaluate(async (itemMenuSelector) => {
                    const menuItems = Array.from(document.querySelectorAll(itemMenuSelector));
                    const contentItem = menuItems.find(item => item.textContent?.trim() === 'Conteúdo');
                    if (contentItem) {
                        const link = contentItem.closest('a');
                        if (link) { link.click(); return true; }
                    }
                    return false;
                }, FILES_MENU.itemMenu);

                if (!filesNavSuccess) {
                    // Try clicking "Materiais" first if it's an accordion
                    log.info('Playwright: "Conteúdo" not found directly, trying "Materiais" accordion...');
                    const materiaisVisible = await page.isVisible('text=Materiais');
                    if (materiaisVisible) {
                        await page.click('text=Materiais');
                        await page.waitForTimeout(500);
                        await page.evaluate((itemMenuSelector) => {
                            const menuItems = Array.from(document.querySelectorAll(itemMenuSelector));
                            const contentItem = menuItems.find(item => item.textContent?.trim() === 'Conteúdo');
                            if (contentItem) {
                                const link = contentItem.closest('a');
                                if (link) { link.click(); return true; }
                            }
                            return false;
                        }, FILES_MENU.itemMenu);
                    }
                }

                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000); // Wait for JSF to settle

                log.info('Playwright: Now on files page. Downloading file.', { fileName });
                log.info(`Playwright: Script present: ${!!script}`);

                const result = await downloadService.downloadFile(
                    page,
                    fileUrl,
                    fileName,
                    courseName,
                    basePath,
                    script
                );

                await localBrowser.close();
                return result;
            } catch (error: any) {
                if (localBrowser) {
                    await localBrowser.close();
                }

                if (error.message === 'JSF_SESSION_EXPIRED' && attempt < maxRetries) {
                    log.info('Playwright: Session expired during single download. Restarting...');
                    attempt++;
                    continue;
                }

                log.error('Playwright: Download error.', { error });
                return { success: false, error: error.message };
            }
        }
        return { success: false, error: 'Maximum retries reached for single download' };
    }

    async downloadAllFiles(
        courseId: string,
        courseName: string,
        files: Array<{ name: string; url: string; script?: string }>,
        basePath: string,
        downloadedFiles: Record<string, any>,
        onProgress?: (fileName: string, status: 'downloaded' | 'skipped' | 'failed') => void
    ): Promise<{
        downloaded: number;
        skipped: number;
        failed: number;
        results: any[];
    }> {
        const maxRetries = 1;
        let attempt = 0;

        while (attempt <= maxRetries) {
            let localBrowser: Browser | null = null;
            try {
                const { DownloadService } = await import('./download.service');

                // Launch a dedicated browser for this batch download
                localBrowser = await chromium.launch({ channel: 'chrome', headless: false });
                const downloadService = new DownloadService(localBrowser);

                const context = await localBrowser.newContext();
                // Inject stored cookies
                if (this.storedCookies.length > 0) {
                    await context.addCookies(this.storedCookies);
                }

                const page = await context.newPage();

                // If this is a retry due to session timeout, we must force a fresh entry to the course
                if (attempt > 0) {
                    log.info(`Playwright: Download retry attempt ${attempt}. Forcing course re-entry...`);
                    // Perform the robust course entry login process
                    const enterResult = await this.enterCourseAndGetHTML(courseId, courseName);
                    if (!enterResult.success) {
                        await localBrowser.close();
                        throw new Error('Could not re-enter course for download retry.');
                    }
                    // Since we re-entered in the main browser, our main cookies are updated.
                    // Copy them to localBrowser
                    const freshCookies = await this.context!.cookies();
                    await context.addCookies(freshCookies);
                }

                // Navigate to course page first
                const navigated = await this.navigateToCourse(page, courseId);
                if (!navigated) {
                    await localBrowser.close();
                    return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
                }

                // CRITICAL: Navigate to the files/materials section (Materiais > Conteúdo)
                log.info('Playwright: Navigating to files section for batch download...');
                const batchFilesNavSuccess = await page.evaluate(async (itemMenuSelector) => {
                    const menuItems = Array.from(document.querySelectorAll(itemMenuSelector));
                    const contentItem = menuItems.find(item => item.textContent?.trim() === 'Conteúdo');
                    if (contentItem) {
                        const link = contentItem.closest('a');
                        if (link) { link.click(); return true; }
                    }
                    return false;
                }, FILES_MENU.itemMenu);

                if (!batchFilesNavSuccess) {
                    log.info('Playwright: "Conteúdo" not found directly, trying "Materiais" accordion...');
                    const materiaisVisible = await page.isVisible('text=Materiais');
                    if (materiaisVisible) {
                        await page.click('text=Materiais');
                        await page.waitForTimeout(500);
                        await page.evaluate((itemMenuSelector) => {
                            const menuItems = Array.from(document.querySelectorAll(itemMenuSelector));
                            const contentItem = menuItems.find(item => item.textContent?.trim() === 'Conteúdo');
                            if (contentItem) {
                                const link = contentItem.closest('a');
                                if (link) { link.click(); return true; }
                            }
                            return false;
                        }, FILES_MENU.itemMenu);
                    }
                }

                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000);

                const result = await downloadService.downloadCourseFiles(
                    page,
                    courseId,
                    courseName,
                    files,
                    basePath,
                    downloadedFiles,
                    onProgress
                );

                await localBrowser.close();
                return result;
            } catch (error: any) {
                if (localBrowser) {
                    await localBrowser.close();
                }

                if (error.message === 'JSF_SESSION_EXPIRED' && attempt < maxRetries) {
                    log.info('Playwright: Session expired during download batch. Restarting batch...');
                    attempt++;
                    continue;
                }

                log.error('Playwright: Download all error.', { error });
                return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
            }
        }
        return { downloaded: 0, skipped: 0, failed: files.length, results: [] };
    }

    async getNewsDetail(courseId: string, courseName: string, newsId: string): Promise<{ success: boolean; news?: NewsDetail; error?: string }> {
        try {
            log.info('Playwright: Fetching news for course.', { newsId, courseName });

            if (!this.browser || !this.context || !this.page || this.page.isClosed()) {
                log.info('Playwright: Browser not active, relaunching...');
                await this.getCourses();
            }

            if (!this.page || this.page.isClosed()) {
                return { success: false, error: 'Failed to initialize browser page' };
            }

            const page = this.page;

            // 1. Navigate to course AVA page if not already there
            if (!page.url().includes('ava/index.jsf')) {
                log.info('Playwright: Navigating to AVA...');
                // We need to enter the course first
                const enterResult = await this.enterCourseAndGetHTML(courseId, courseName);
                if (!enterResult.success) {
                    return { success: false, error: enterResult.error };
                }
            }

            // 2. Find and click the news link
            // News links are inside forms that contain a hidden input with name="id" and value=newsId
            // Structure: <form><input name="id" value="newsId"><a href="#" onclick="...">(Visualizar)</a></form>
            log.info(`Playwright: Looking for news link with ID ${newsId}...`);

            let found = false;

            // Strategy 1: Find form with hidden input containing the news ID
            const formSelector = newsFormSelector(newsId);
            const newsForm = await page.$(formSelector);

            if (newsForm) {
                log.info(`Playwright: Found form containing news ID ${newsId}.`);
                const linkInForm = await newsForm.$('a');
                if (linkInForm) {
                    log.info('Playwright: Clicking link inside form...');
                    await linkInForm.click();
                    found = true;
                }
            }

            // Strategy 2: Fallback - look in page.evaluate for more complex DOM traversal
            if (!found) {
                log.info('Playwright: Form selector failed, using page.evaluate...');
                found = await page.evaluate(({ id, idInputSelector }) => {
                    const inputs = document.querySelectorAll(idInputSelector);
                    for (const input of inputs) {
                        if ((input as HTMLInputElement).value === id) {
                            const form = input.closest('form');
                            if (form) {
                                const link = form.querySelector('a');
                                if (link) {
                                    (link as HTMLAnchorElement).click();
                                    return true;
                                }
                            }
                        }
                    }
                    return false;
                }, { id: newsId, idInputSelector: NEWS.idInput });
            }
            
            // Session Timeout Recovery Strategy:
            // If the element wasn't found, the JSF session might have expired in the background 
            // while keeping the 'ava/index.jsf' URL. We must force a refresh/re-entry.
            if (!found) {
                log.info(`Playwright: News ID ${newsId} not found. Session may have expired. Forcing course re-entry...`);
                await this.enterCourseAndGetHTML(courseId, courseName);

                // Try finding it one more time
                const retryNewsForm = await page.$(formSelector);
                if (retryNewsForm) {
                    log.info('Playwright: Found form after forcing course refresh!');
                    const linkInForm = await retryNewsForm.$('a');
                    if (linkInForm) {
                        await linkInForm.click();
                        found = true;
                    }
                }
            }

            if (!found) {
                const html = await page.content().catch(() => '');
                const safeId = String(newsId).replace(/[^a-zA-Z0-9_-]/g, '_');
                if (html) diagnosticsService.saveRaw(`debug_playwright_news_fail_${safeId}.html`, html);
                return { success: false, error: `News link with ID ${newsId} not found` };
            }

            log.info(`Playwright: Successfully clicked news link for ${newsId}.`);

            // 3. Wait for page to load
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000);

            // DEBUG: Save news detail page HTML (dev only)
            const newsDetailHtml = await page.content().catch(() => '');
            const newsDetailSafeId = String(newsId).replace(/[^a-zA-Z0-9_-]/g, '_');
            if (newsDetailHtml) diagnosticsService.saveRaw(`debug_news_detail_${newsDetailSafeId}.html`, newsDetailHtml);

            // 4. Parse the news content
            const newsData = await page.evaluate(() => {
                const getText = (label: string): string => {
                    const allElements = document.querySelectorAll('td, th, span, label, strong, b, div');
                    for (const el of allElements) {
                        const text = el.textContent?.trim().replace(':', '');
                        if (text === label) {
                            // Try sibling
                            const next = el.nextElementSibling;
                            if (next) return next.textContent?.trim() || '';
                            // Try parent's sibling (table row)
                            const parentTd = el.closest('td');
                            if (parentTd && parentTd.nextElementSibling) {
                                return parentTd.nextElementSibling.textContent?.trim() || '';
                            }
                        }
                    }
                    return '';
                };

                const getContent = (): string => {
                    // Strategy 1: Look for "Texto" label in th/td structure
                    // Structure: <th><b>Texto:</b></th><td>...content...</td>
                    const thElements = document.querySelectorAll('th');
                    for (const th of thElements) {
                        if (th.textContent?.trim().replace(':', '').toLowerCase() === 'texto') {
                            // Get the next sibling td
                            const nextTd = th.nextElementSibling;
                            if (nextTd && nextTd.tagName === 'TD') {
                                // Get the content and clean it up
                                let html = nextTd.innerHTML;
                                // Remove excessive whitespace
                                html = html.replace(/\s+/g, ' ').trim();
                                return html;
                            }
                        }
                    }

                    // Strategy 2: Look for td/label pairs
                    const allElements = document.querySelectorAll('td, th, span, label, strong, b, div');
                    for (const el of allElements) {
                        const text = el.textContent?.trim().replace(':', '');
                        if (text === 'Texto') {
                            const parentTd = el.closest('td') || el.closest('th');
                            if (parentTd && parentTd.nextElementSibling) {
                                return parentTd.nextElementSibling.innerHTML || '';
                            }
                        }
                    }

                    // Strategy 3: Look for content in specific SIGAA containers
                    const contentContainers = [
                        '.conteudo-noticia',
                        '#conteudo-noticia',
                        '.texto-noticia',
                        '.noticia-texto',
                        'div[class*="noticia"]',
                        '.msgBody',
                        '#msgBody'
                    ];

                    for (const selector of contentContainers) {
                        const container = document.querySelector(selector);
                        if (container && container.innerHTML.trim()) {
                            return container.innerHTML;
                        }
                    }

                    // Strategy 4: Look for the largest content block on the page
                    const mainContent = document.getElementById('conteudo');
                    if (mainContent) {
                        // Find the deepest div with significant text content
                        const divs = mainContent.querySelectorAll('div, td');
                        let bestContent = '';
                        let maxLength = 0;

                        for (const div of divs) {
                            const text = div.textContent?.trim() || '';
                            // Skip if it contains labels like "Título", "Data", etc.
                            if (text.length > maxLength &&
                                !text.startsWith('Título') &&
                                !text.startsWith('Data') &&
                                !text.startsWith('Notificação') &&
                                text.length > 20) {
                                maxLength = text.length;
                                bestContent = div.innerHTML;
                            }
                        }

                        if (bestContent) return bestContent;
                    }

                    return '';
                };

                return {
                    title: getText('Título') || getText('Assunto'),
                    date: getText('Data') || getText('Data de Cadastro'),
                    content: getContent(),
                    notification: getText('Notificação')
                };
            });

            log.info('Playwright: Parsed news.', { title: newsData.title, contentLength: newsData.content.length });

            // 5. Navigate back to AVA if needed (for subsequent operations)
            // Not strictly necessary but keeps state clean
            // await page.goBack();

            if (!newsData.content && !newsData.title) {
                const html = await page.content().catch(() => '');
                if (html) diagnosticsService.saveRaw(`debug_playwright_news_${newsId}.html`, html);
                return { success: false, error: 'Could not parse news content from page' };
            }

            return { success: true, news: newsData };

        } catch (error: any) {
            log.error('Playwright: Error fetching news.', { error });
            return { success: false, error: error.message };
        }
    }

    /**
     * Sai de verdade (DATA-002): `close()` mais esquecer cookies e credencial
     * guardados. `close()` sozinho os preserva de propósito — `getCourses()`
     * fecha e relança com eles a cada sync — então sem isto um sync em voo
     * relançaria o Chrome com a sessão e a senha de quem acabou de sair.
     */
    async logout() {
        await this.close();
        this.storedCookies = [];
        this.storedUsername = null;
        this.storedPassword = null;
    }

    async close() {
        if (this.browser) {
            log.info('Playwright: Closing browser...');
            try {
                await this.browser.close();
            } catch (err) {
                // Teardown only: the browser may already be dead; the goal
                // (releasing the handles) is achieved either way.
                log.warn('Playwright: browser.close() failed during teardown.', { error: err });
            }
            this.browser = null;
        }
        this.context = null;
        this.page = null;
    }
    async getUserAgent(): Promise<string> {
        if (this.page) {
            return await this.page.evaluate(() => navigator.userAgent);
        }
        if (this.context) {
            const page = await this.context.newPage();
            const ua = await page.evaluate(() => navigator.userAgent);
            await page.close();
            return ua;
        }
        // Fallback if no browser is open (shouldn't happen if we are syncing)
        return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    }
}
