import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

interface Cookie {
    name: string;
    value: string;
    path?: string;
    domain: string;
    expires?: Date;
}

export class HttpScraperService {
    private cookies: Cookie[] = [];
    private baseUrl: string = 'https://si3.ufc.br';
    private logPath = path.join(process.cwd(), 'scraper.log');
    private courseData: Map<string, { viewState: string; action: string; formName: string; inputs: Record<string, string> }> = new Map();

    private logStream: fs.WriteStream;

    constructor() {
        // Create/Clear log file on startup using WriteStream
        this.logStream = fs.createWriteStream(this.logPath, { flags: 'w' });

        // Handle stream errors
        this.logStream.on('error', (err) => {
            console.error('Log stream error:', err);
        });
    }

    private log(message: string) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);

        // Non-blocking write
        if (this.logStream.writable) {
            this.logStream.write(logMessage);
        }
    }

    setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>) {
        this.cookies = cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || new URL(this.baseUrl).hostname,
            path: c.path || '/'
        }));
        this.log(`[HttpScraper] Cookies set. Count: ${this.cookies.length}`);
    }

    private getCookieHeader(url: string): string {
        const urlObj = new URL(url);
        const validCookies = this.cookies.filter(cookie => {
            if (cookie.path && !urlObj.pathname.startsWith(cookie.path)) return false;
            const requestDomain = urlObj.hostname;
            if (!requestDomain.endsWith(cookie.domain)) return false;
            if (cookie.expires && cookie.expires < new Date()) return false;
            return true;
        });

        if (validCookies.length === 0) return '';
        return validCookies.map(c => `${c.name}=${c.value}`).join('; ');
    }

    private updateCookies(response: AxiosResponse) {
        const setCookie = response.headers['set-cookie'];
        if (!setCookie) return;

        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
        for (const cookieStr of cookies) {
            const parsed = this.parseCookie(cookieStr);
            if (parsed) {
                this.cookies = this.cookies.filter(
                    c => !(c.name === parsed.name && c.domain === parsed.domain)
                );
                this.cookies.unshift(parsed);
            }
        }
    }

    private parseCookie(cookieStr: string): Cookie | null {
        const nameMatch = cookieStr.match(/^[^()<>@,;:\\" \t\n/[\]?={}]+/);
        if (!nameMatch) return null;

        const name = nameMatch[0];
        let remaining = cookieStr.substr(name.length);

        const valueMatch = remaining.match(/^=([^; \t\n,\\]*)/);
        if (!valueMatch) return null;

        const value = valueMatch[1].replace(/^"|"$/g, '');
        remaining = remaining.substr(valueMatch[0].length);

        const cookie: Cookie = {
            name,
            value,
            domain: new URL(this.baseUrl).hostname
        };

        const flags = remaining.split('; ');
        for (const flag of flags) {
            if (flag.match(/^Path=/i)) cookie.path = flag.replace(/^Path=/i, '');
            else if (flag.match(/^Domain=/i)) cookie.domain = flag.replace(/^Domain=\.?/i, '');
            else if (flag.match(/^Max-Age=/i)) {
                const maxAge = Number(flag.replace(/^Max-Age=/i, ''));
                cookie.expires = new Date(Date.now() + maxAge * 1000);
            } else if (flag.match(/^Expires=/i)) cookie.expires = new Date(flag.replace(/^Expires=/i, ''));
        }

        return cookie;
    }

    private userAgent: string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'; // Default

    setUserAgent(ua: string) {
        this.userAgent = ua;
        this.log(`[HttpScraper] User-Agent set to: ${ua}`);
    }

    async enterCourseHTTP(courseId: string): Promise<{ success: boolean; html?: string; error?: string }> {
        try {
            this.log(`[HttpScraper] Entering course ${courseId} via HTTP...`);

            // 1. Get Portal Page to find the form
            const portalUrl = `${this.baseUrl}/sigaa/verPortalDiscente.do`;
            const portalResponse = await axios.get(portalUrl, {
                headers: {
                    'Cookie': this.getCookieHeader(portalUrl),
                    'User-Agent': this.userAgent,
                    'Referer': `${this.baseUrl}/sigaa/paginaInicial.do`,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                }
            });
            this.updateCookies(portalResponse);

            const $ = cheerio.load(portalResponse.data);

            // 2. Find the input for this course ID
            const idInput = $(`input[name="idTurma"][value="${courseId}"]`);
            if (idInput.length === 0) {
                const title = $('title').text().trim();
                this.log(`[HttpScraper] Error: Course ID ${courseId} not found. Page Title: "${title}"`);
                try {
                    await fs.promises.writeFile(`debug_portal_fail_${courseId}.html`, portalResponse.data);
                } catch (e) { console.error('Failed to save debug file', e); }
                return { success: false, error: `Course ID input not found in portal (Title: ${title})` };
            }

            // 3. Find the surrounding form
            const form = idInput.closest('form');
            if (form.length === 0) {
                return { success: false, error: 'Course form not found' };
            }

            const formName = form.attr('name');
            const formAction = form.attr('action') || '/sigaa/verPortalDiscente.do';

            // 4. Find the link to extract onclick parameters
            // The link usually has id containing "turmaVirtual"
            const link = idInput.closest('tr').find('a[id*="turmaVirtual"]');
            const onclick = link.attr('onclick');

            if (!onclick || !formName) {
                return { success: false, error: 'Could not extract form parameters from course link' };
            }

            // Parse jsfcljs parameters
            // Pattern: jsfcljs(document.forms['FORM_NAME'],'PARAM1,PARAM1','');
            const match = onclick.match(/jsfcljs\(document\.forms\['([^']+)'\],'([^']+)'/);
            if (!match) {
                return { success: false, error: 'Invalid jsfcljs format in course link' };
            }

            const paramsStr = match[2]; // e.g. "form_acessarTurmaVirtual:turmaVirtual,form_acessarTurmaVirtual:turmaVirtual"
            const [paramKey, paramValue] = paramsStr.split(',');

            // 5. Construct Form Data
            const formData = new URLSearchParams();
            formData.append(formName, formName);
            formData.append('javax.faces.ViewState', $('input[name="javax.faces.ViewState"]').val() as string);
            formData.append(paramKey, paramValue);
            formData.append('idTurma', courseId);

            // 6. Post to enter course
            const actionUrl = `${this.baseUrl}${formAction}`;
            this.log(`[HttpScraper] Posting to ${actionUrl} to enter course...`);

            const enterResponse = await axios.post(actionUrl, formData.toString(), {
                headers: {
                    'Cookie': this.getCookieHeader(actionUrl),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': this.baseUrl,
                    'Referer': portalUrl
                },
                maxRedirects: 5
            });
            this.updateCookies(enterResponse);

            // Check if we are in the course (look for specific elements)
            if (enterResponse.data.includes('O Sistema detectou que até agora seu professor não criou nenhum tópico de aula') ||
                enterResponse.data.includes('Menu Turma Virtual') ||
                enterResponse.data.includes('id="conteudo"')) {

                this.log('[HttpScraper] Successfully entered course via HTTP!');
                return { success: true, html: enterResponse.data };
            } else {
                // Sometimes it redirects to a frameset or something else
                this.log('[HttpScraper] Warning: Response does not look like a course page. Saving debug file.');
                try {
                    await fs.promises.writeFile(`debug_http_entry_${courseId}.html`, enterResponse.data);
                } catch (e) { }
                return { success: false, error: 'Failed to verify course entry (unexpected response content)' };
            }

        } catch (error: any) {
            this.log(`[HttpScraper] HTTP Entry Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }



    async getCourseFiles(courseId: string, courseName?: string, preFetchedHtml?: string): Promise<{ success: boolean; files?: any[]; news?: any[]; error?: string }> {
        try {
            if (this.cookies.length === 0) {
                return { success: false, error: 'No session cookies. Please login first.' };
            }

            this.log(`[HttpScraper] Fetching course page for ${courseName || courseId}...`);

            let coursePageData = '';
            let currentUrl = `${this.baseUrl}/sigaa/ava/index.jsf`;

            if (preFetchedHtml) {
                this.log(`[HttpScraper] Using pre-fetched HTML from Playwright. Length: ${preFetchedHtml.length}`);
                coursePageData = preFetchedHtml;

                const $debug = cheerio.load(coursePageData);
                this.log(`[HttpScraper] Pre-fetched page title: "${$debug('title').text().trim()}"`);
            } else {
                this.log('[HttpScraper] WARNING: No pre-fetched HTML provided. Falling back to HTTP entry.');

                const dashboardUrl = `${this.baseUrl}/sigaa/portais/discente/discente.jsf`;
                const dashboardResponse = await axios.get(dashboardUrl, {
                    headers: {
                        'Cookie': this.getCookieHeader(dashboardUrl),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                        'Accept-Language': 'pt-BR,pt;q=0.9',
                        'Referer': `${this.baseUrl}/sigaa/verPortalDiscente.do`,
                        'Connection': 'keep-alive'
                    },
                    timeout: 10000
                });

                this.updateCookies(dashboardResponse);
                coursePageData = dashboardResponse.data;
            }

            const $ = cheerio.load(coursePageData);
            let filesPageData = coursePageData;
            let conteudoLink: any = null;

            // Skip navigation if using Playwright HTML (already navigated)
            if (preFetchedHtml) {
                try {
                    await fs.promises.writeFile(`debug_playwright_${courseId}.html`, preFetchedHtml);
                    this.log('[HttpScraper] Saved Playwright HTML to debug_playwright.html');
                } catch (e) {
                    this.log('[HttpScraper] Failed to save debug file');
                }
                this.log('[HttpScraper] Using Playwright HTML directly.');
            } else {
                // Strategy 1: Look for "Conteúdo" in menu
                $('.itemMenu').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text.includes(' Conte') || text.includes('nteudo')) {
                        this.log(`[HttpScraper] Found potential link: "${text}"`);
                        conteudoLink = $(el).parent('a');
                        return false;
                    }
                });

                // Strategy 2: Look for "Materiais" header
                if (!conteudoLink) {
                    this.log('[HttpScraper] Strategy 1 failed. Trying Strategy 2 (Materiais header)...');
                    const materiaisHeader = $('.itemMenuHeaderMateriais');
                    if (materiaisHeader.length > 0) {
                        const contentExterior = materiaisHeader.parent().find('.rich-panelbar-content-exterior');
                        const firstLink = contentExterior.find('a').first();
                        if (firstLink.length > 0) {
                            this.log('[HttpScraper] Found first link under Materiais.');
                            conteudoLink = firstLink;
                        }
                    }
                }

                if (conteudoLink) {
                    this.log('[HttpScraper] Found "Conteúdo" link in sidebar. Navigating to files...');
                    const onclick = conteudoLink.attr('onclick');
                    const match = onclick?.match(/jsfcljs\(document\.forms\['([^']+)'\],'([^']+)'/);

                    if (match) {
                        const formName = match[1];
                        const paramsStr = match[2];

                        const form = $(`form[name="${formName}"]`);
                        const formData = new URLSearchParams();

                        form.find('input').each((_, el) => {
                            const name = $(el).attr('name');
                            const value = $(el).attr('value');
                            if (name && value) formData.append(name, value);
                        });

                        // Ensure ViewState is present
                        if (!formData.has('javax.faces.ViewState')) {
                            const globalViewState = $('input[name="javax.faces.ViewState"]').val();
                            if (globalViewState) {
                                formData.append('javax.faces.ViewState', globalViewState as string);
                            }
                        }

                        const params = paramsStr.split(',');
                        for (let i = 0; i < params.length; i += 2) {
                            if (params[i] && params[i + 1]) {
                                formData.append(params[i], params[i + 1]);
                            }
                        }

                        this.log(`[HttpScraper] Sending POST to open files. Form: ${formName}`);

                        const filesResponse = await axios.post(`${this.baseUrl}/sigaa/ava/index.jsf`, formData.toString(), {
                            headers: {
                                'Cookie': this.getCookieHeader(`${this.baseUrl}/sigaa/ava/index.jsf`),
                                'Content-Type': 'application/x-www-form-urlencoded',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Referer': currentUrl,
                                'Connection': 'keep-alive'
                            },
                            timeout: 10000
                        });
                        this.updateCookies(filesResponse);
                        filesPageData = filesResponse.data;
                    } else {
                        this.log('[HttpScraper] Could not parse onclick for "Conteúdo" link.');
                    }
                } else {
                    this.log('[HttpScraper] "Conteúdo" link not found in sidebar. Scanning current page...');
                }
            }

            // --- Common logic for parsing files page (whether from Playwright or Axios) ---
            const $files = cheerio.load(filesPageData);

            // Extract ViewState
            const viewState = $files('input[name="javax.faces.ViewState"]').val() as string;

            // Extract other form inputs
            // We need to find the main form (usually named 'formAva')
            let filesForm = $files('form[name="formAva"]');
            if (filesForm.length === 0) {
                // Fallback to first form if formAva not found
                filesForm = $files('form').first();
            }

            const formAction = filesForm.attr('action') || '/sigaa/ava/index.jsf';
            const formNameStr = filesForm.attr('name') || 'formAva';

            const inputs: Record<string, string> = {};
            filesForm.find('input').each((_, el) => {
                const name = $files(el).attr('name');
                const value = $files(el).attr('value');
                if (name && value !== undefined) {
                    inputs[name] = value;
                }
            });

            if (viewState) {
                this.courseData.set(courseId, {
                    viewState,
                    action: formAction,
                    formName: formNameStr,
                    inputs
                });
                this.log(`[HttpScraper] Stored ViewState and ${Object.keys(inputs).length} inputs for course ${courseId}`);
            } else {
                this.log(`[HttpScraper] WARNING: Could not extract ViewState for course ${courseId}`);
            }

            const files: any[] = [];
            const news: any[] = [];

            this.log('[HttpScraper] Scanning for files...');
            $files('a').each((_, el) => {
                const link = $files(el);
                const text = link.text().trim();
                const onclick = link.attr('onclick');
                const href = link.attr('href');

                // Strategy 1: Detect files by onclick pattern (jsfcljs with id parameter)
                if (onclick && onclick.includes('jsfcljs') && onclick.includes(',id,')) {
                    const idMatch = onclick.match(/,id,([^,]+)/);
                    const keyMatch = onclick.match(/,key,([^,'"]+)/);

                    if (idMatch) {
                        // Try to find the actual filename in the surrounding context
                        // Files are typically in a table row where the filename is in a previous cell
                        let fileName = text;
                        const row = link.closest('tr');
                        if (row.length > 0) {
                            // Look for filename in table cells
                            const cells = $files(row).find('td');
                            cells.each((_, cell) => {
                                const cellText = $files(cell).text().trim();
                                // If the cell contains a file extension, it's likely the filename
                                if (cellText.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i)) {
                                    fileName = cellText;
                                    return false; // break
                                }
                            });
                        }

                        // this.log(`[HttpScraper] Found file: "${fileName}" (ID: ${idMatch[1]})`);
                        files.push({
                            name: fileName,
                            type: 'file',
                            id: idMatch[1],
                            key: keyMatch ? keyMatch[1] : undefined,
                            script: onclick
                        });
                    }
                }
                // Strategy 2: Detect files by explicit filename patterns (legacy)
                else if (text && (text.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i) ||
                    text.toLowerCase().includes('lista') ||
                    text.toLowerCase().includes('exerc') ||
                    text.toLowerCase().includes('arquivo') ||
                    text.toLowerCase().includes('material'))) {

                    if (onclick && onclick.includes('id')) {
                        const idMatch = onclick.match(/,id,([^,]+)/);
                        const keyMatch = onclick.match(/,key,([^,'"]+)/);

                        if (idMatch) {
                            files.push({
                                name: text,
                                type: 'file',
                                id: idMatch[1],
                                key: keyMatch ? keyMatch[1] : undefined,
                                script: onclick
                            });
                        }
                    } else if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                        files.push({
                            name: text,
                            type: 'link',
                            url: href.startsWith('http') ? href : this.baseUrl + href
                        });
                    }
                }
            });

            const $newsPage = cheerio.load(coursePageData);
            $newsPage('table').each((_, table) => {
                const headers = $newsPage(table).find('th').map((__, th) => $newsPage(th).text().trim()).get();
                if (headers.includes('Título') && headers.includes('Data')) {
                    $newsPage(table).find('tr').each((__, row) => {
                        const cells = $newsPage(row).find('td');
                        if (cells.length >= 2) {
                            const title = $(cells[0]).text().trim();
                            const date = $(cells[1]).text().trim();
                            const notification = $(cells[2]).text().trim();

                            const link = $(cells[0]).find('a');
                            const onclick = link.attr('onclick');

                            if (title && date && onclick) {
                                const idMatch = onclick.match(/['"](\\d+)['"]/);
                                if (idMatch) {
                                    news.push({
                                        title,
                                        date,
                                        notification,
                                        id: idMatch[1],
                                        script: onclick  // Capture the script for later use
                                    });
                                }
                            }
                        }
                    });
                }
            });

            // Strategy 2: Parse sidebar news (rich-stglpanel)
            if (news.length === 0) {
                $newsPage('.rich-stglpanel').each((_, panel) => {
                    const header = $newsPage(panel).find('.rich-stglpanel-header').text().trim();
                    if (header.includes('Notícias')) {
                        const body = $newsPage(panel).find('.rich-stglpanel-body');

                        let currentDate = '';
                        let currentTitle = '';

                        body.contents().each((__, element) => {
                            // Check for text node containing date
                            if (element.type === 'text') {
                                const text = $(element).text().trim();
                                // Match date format dd/mm/yyyy hh:mm or just dd/mm/yyyy
                                if (text.match(/\d{2}\/\d{2}\/\d{4}/)) {
                                    currentDate = text;
                                }
                            }
                            // Check for title in italics
                            else if (element.type === 'tag' && element.tagName === 'i') {
                                currentTitle = $(element).text().trim();
                            }
                            // Check for form with ID
                            else if (element.type === 'tag' && element.tagName === 'form') {
                                const form = $(element);
                                const idInput = form.find('input[name="id"]').val();

                                if (idInput && currentDate && currentTitle) {
                                    news.push({
                                        title: currentTitle,
                                        date: currentDate,
                                        id: String(idInput),
                                        notification: ''
                                    });
                                }
                            }
                        });
                    }
                });
            }

            // Strategy 3: Parse sidebar timeline for FILE dates (e.g. "Adicionado arquivo Lista 3")
            const fileEvents: { name: string, date: string }[] = [];

            // Look in all panels (Notícias, Atividades, etc) for .menu-direita
            $newsPage('.rich-stglpanel-body .menu-direita li').each((_, li) => {
                const dateText = $(li).find('.data').text().trim(); // "22/11" or "22/11 10:00"
                const descText = $(li).find('.descricao').text().trim(); // "Adicionado arquivo Lista 3"

                // Parse date - usually dd/mm or dd/mm/yyyy. Assume current year if missing.
                let date = dateText;
                if (date && date.match(/^\d{2}\/\d{2}$/)) {
                    const currentYear = new Date().getFullYear();
                    date = `${date}/${currentYear}`;
                }

                if (descText.startsWith('Adicionado arquivo')) {
                    const fileName = descText.replace('Adicionado arquivo', '').trim();
                    if (fileName && date) {
                        fileEvents.push({ name: fileName, date });
                    }
                }
            });

            this.log(`[HttpScraper] Found ${fileEvents.length} file events in timeline.`);

            // Map dates to files
            files.forEach(file => {
                // strict match first
                let event = fileEvents.find(e => e.name === file.name);

                if (!event) {
                    // Try partial match (sometimes filenames are truncated or formatted differently)
                    event = fileEvents.find(e => file.name.includes(e.name) || e.name.includes(file.name));
                }

                if (event) {
                    file.date = event.date;
                    // this.log(`[HttpScraper] Matched date ${event.date} for file ${file.name}`);
                }
            });

            this.log(`[HttpScraper] Found ${files.length} files and ${news.length} news items.`);
            this.log(`[HttpScraper] Found ${files.length} files and ${news.length} news items for course ${courseId}`);

            return { success: true, files, news };

        } catch (error: any) {
            console.error('[HttpScraper] Error fetching course files:', error);
            this.log(`[HttpScraper] Error fetching course files: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    async getNewsDetail(courseId: string, newsId: string, script?: string): Promise<{ success: boolean; news?: any; error?: string }> {
        try {
            this.log(`[HttpScraper] Fetching news detail ${newsId} for course ${courseId}`);

            // 1. Check if we have session data for this course
            const courseInfo = this.courseData.get(courseId);
            if (!courseInfo) {
                return { success: false, error: 'Course session data not found. Please refresh the course list.' };
            }

            // 2. Prepare Form Data
            const formData = new URLSearchParams();

            // Add inputs from cached session
            if (courseInfo.inputs) {
                Object.entries(courseInfo.inputs).forEach(([key, value]) => {
                    formData.append(key, value);
                });
            }

            // Add ViewState
            formData.set('javax.faces.ViewState', courseInfo.viewState);

            // Add Form Name
            if (!formData.has(courseInfo.formName)) {
                formData.append(courseInfo.formName, courseInfo.formName);
            }

            // 3. Parse Script (Onclick) to get specific parameters
            // Example: jsfcljs(document.forms['formAva'],'formAva:noticias:0:visualizar,formAva:noticias:0:visualizar,id,12345','');
            if (script) {
                this.log(`[HttpScraper] Using provided script: ${script}`);
                const match = script.match(/jsfcljs\([^,]+,'([^']+)'/);
                if (match) {
                    const paramsStr = match[1];
                    const params = paramsStr.split(',');
                    // Add all params from script
                    for (let i = 0; i < params.length; i += 2) {
                        if (params[i] && params[i + 1]) {
                            formData.append(params[i], params[i + 1]);
                        }
                    }
                    // Ensure the main component ID is sent (often the first param is the trigger)
                    const componentId = params[0];
                    formData.append(componentId, componentId);
                }
            } else {
                // Fallback (guessing parameter names - risky)
                this.log(`[HttpScraper] No script provided. Attempting generic fetch.`);
                formData.append('id', newsId);
            }

            this.log(`[HttpScraper] Posting to ${courseInfo.action} to fetch news...`);

            const newsResponse = await axios.post(`${this.baseUrl}${courseInfo.action}`, formData.toString(), {
                headers: {
                    'Cookie': this.getCookieHeader(`${this.baseUrl}${courseInfo.action}`),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': `${this.baseUrl}${courseInfo.action}`,
                    'Connection': 'keep-alive'
                },
                timeout: 10000
            });

            this.updateCookies(newsResponse);

            // DEBUG: Save the news page
            try {
                await fs.promises.writeFile(`debug_news_content_${newsId}.html`, newsResponse.data);
                this.log(`[HttpScraper] Saved debug_news_content_${newsId}.html`);
            } catch (e) { console.error(e); }

            const $news = cheerio.load(newsResponse.data);

            // Parsing Logic
            const getTextAfterLabel = (label: string) => {
                let result = '';
                $news('td, th, label, span, div, strong, b').each((_, el) => {
                    const text = $news(el).text().trim().replace(':', '');
                    if (text === label) {
                        // Try next sibling
                        let next = $news(el).next();
                        if (next.length > 0) {
                            result = next.text().trim();
                            return false;
                        }
                        // Try parent's next sibling (table structure)
                        const parentTd = $news(el).closest('td');
                        if (parentTd.length && parentTd.next().length) {
                            result = parentTd.next().text().trim();
                            return false;
                        }
                    }
                });
                return result;
            };

            const getContent = () => {
                let result = '';
                $news('td, th, label, span, div, strong, b').each((_, el) => {
                    const text = $news(el).text().trim().replace(':', '');
                    if (text === 'Texto') {
                        const parentTd = $news(el).closest('td');
                        if (parentTd.length && parentTd.next().length) {
                            // Get inner HTML of the content cell
                            result = parentTd.next().html() || '';
                            return false;
                        }
                    }
                });
                return result;
            };

            const title = getTextAfterLabel('Título') || getTextAfterLabel('Assunto');
            const date = getTextAfterLabel('Data') || getTextAfterLabel('Data de Cadastro');
            const content = getContent();

            this.log(`[HttpScraper] Parsed News: Title="${title}", Date="${date}", ContentLength=${content.length}`);

            if (!content) {
                return { success: false, error: 'Could not extract news content from response' };
            }

            const newsDetail = {
                title,
                date,
                content,
                notification: getTextAfterLabel('Notificação')
            };

            return { success: true, news: newsDetail };

        } catch (error: any) {
            this.log(`[HttpScraper] News Fetch Error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    private async verifyFileContent(filePath: string, expectedExtension: string): Promise<boolean> {
        try {
            const handle = await fs.promises.open(filePath, 'r');
            const buffer = Buffer.alloc(8);
            await handle.read(buffer, 0, 8, 0);
            await handle.close();

            const hex = buffer.toString('hex').toUpperCase();

            // Magic Bytes signatures
            const signatures: Record<string, string[]> = {
                '.pdf': ['25504446'], // %PDF
                '.zip': ['504B0304'], // PK..
                '.docx': ['504B0304'], // PK..
                '.xlsx': ['504B0304'], // PK..
                '.pptx': ['504B0304'], // PK..
                '.png': ['89504E47'], // .PNG
                '.jpg': ['FFD8FF'],
                '.jpeg': ['FFD8FF'],
                '.gif': ['47494638'], // GIF8
                '.rar': ['52617221'], // Rar!
            };

            // If we have a signature for this extension, check it
            if (signatures[expectedExtension]) {
                const isValid = signatures[expectedExtension].some(sig => hex.startsWith(sig));
                if (!isValid) {
                    this.log(`[HttpScraper] Magic Byte mismatch for ${expectedExtension}. Found: ${hex}`);
                    return false;
                }
            }

            // Check for HTML error pages (often start with <html, <!DOC, or whitespace then <)
            const contentStart = buffer.toString('utf8').trim().substring(0, 5).toLowerCase();
            if (contentStart.startsWith('<html') || contentStart.startsWith('<!doc')) {
                this.log(`[HttpScraper] File appears to be HTML (likely error page)`);
                return false;
            }

            return true;
        } catch (error) {
            this.log(`[HttpScraper] Verification error: ${error}`);
            return false; // Assume invalid if we can't read it
        }
    }

    async downloadFile(
        courseId: string,
        fileId: string,
        fileName: string,
        basePath: string,
        script: string,
        onProgress?: (progress: number) => void
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        try {
            this.log(`[HttpScraper] Downloading file "${fileName}" (ID: ${fileId}) for course ${courseId}`);

            const courseInfo = this.courseData.get(courseId);
            if (!courseInfo) {
                return { success: false, error: 'Course session data not found. Please refresh the course list.' };
            }

            // Extract component ID from script
            const match = script.match(/jsfcljs\([^,]+,'([^']+)'/);
            if (!match) {
                return { success: false, error: 'Invalid download script format' };
            }
            const paramsStr = match[1];
            const params = paramsStr.split(',');
            const componentId = params[0]; // The first item is the source

            const formData = new URLSearchParams();

            // 1. Add all hidden inputs from the form
            if (courseInfo.inputs) {
                Object.entries(courseInfo.inputs).forEach(([key, value]) => {
                    formData.append(key, value);
                });
            }

            // 2. Add/Overwrite ViewState (just in case it wasn't in inputs or needs update)
            formData.set('javax.faces.ViewState', courseInfo.viewState);

            // 3. Add form name (if not in inputs)
            if (!formData.has(courseInfo.formName)) {
                formData.append(courseInfo.formName, courseInfo.formName);
            }

            // 4. Add the component ID (Source)
            formData.append(componentId, componentId);

            // 5. Add other parameters from script (id, key)
            for (let i = 0; i < params.length; i += 2) {
                if (params[i] && params[i + 1]) {
                    formData.append(params[i], params[i + 1]);
                }
            }

            this.log(`[HttpScraper] Sending download request. ComponentID: ${componentId}`);

            const response = await axios.post(`${this.baseUrl}${courseInfo.action}`, formData.toString(), {
                headers: {
                    'Cookie': this.getCookieHeader(`${this.baseUrl}${courseInfo.action}`),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': `${this.baseUrl}${courseInfo.action}`,
                    'Connection': 'keep-alive'
                },
                responseType: 'stream',
                timeout: 60000 // 60s timeout for downloads
            });

            this.updateCookies(response);

            this.log(`[HttpScraper] Response headers: Content-Type=${response.headers['content-type']}, Content-Length=${response.headers['content-length']}`);

            // Check if content-type indicates HTML (error page)
            const contentType = response.headers['content-type'];
            if (contentType && (contentType.includes('text/html') || contentType.includes('application/xhtml'))) {
                this.log('[HttpScraper] WARNING: Response Content-Type is HTML. Likely an error page.');
            }

            // Determine filename and ensure it has an extension
            let finalFileName = fileName;
            let detectedExtension = '';

            // 1. Try to get filename from Content-Disposition header
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]+)['"]?/i);
                if (filenameMatch) {
                    const dispositionFilename = decodeURIComponent(filenameMatch[1].trim());
                    // Use the filename from header - it usually has the correct extension
                    finalFileName = dispositionFilename;
                    detectedExtension = path.extname(dispositionFilename).toLowerCase();
                }
            }

            // 2. If no extension, try to infer from Content-Type
            if (!detectedExtension && !path.extname(finalFileName)) {
                const contentTypeMap: Record<string, string> = {
                    'application/pdf': '.pdf',
                    'application/msword': '.doc',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                    'application/vnd.ms-excel': '.xls',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                    'application/vnd.ms-powerpoint': '.ppt',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
                    'application/zip': '.zip',
                    'application/x-rar-compressed': '.rar',
                    'image/png': '.png',
                    'image/jpeg': '.jpg',
                    'text/plain': '.txt'
                };

                const contentTypeBase = contentType?.split(';')[0]?.trim();
                if (contentTypeBase && contentTypeMap[contentTypeBase]) {
                    detectedExtension = contentTypeMap[contentTypeBase];
                    finalFileName = finalFileName + detectedExtension;
                    this.log(`[HttpScraper] Added extension ${detectedExtension} to filename based on Content-Type`);
                }
            }

            const filePath = path.join(basePath, finalFileName);
            const writer = fs.createWriteStream(filePath);

            const totalLength = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedLength = 0;

            response.data.on('data', (chunk: any) => {
                downloadedLength += chunk.length;
                if (onProgress && totalLength > 0) {
                    onProgress(Math.round((downloadedLength / totalLength) * 100));
                }
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', async () => {
                    // Check file size first
                    const stats = await fs.promises.stat(filePath);

                    // Perform robust verification for ALL files
                    const ext = path.extname(filePath).toLowerCase();
                    const isValid = await this.verifyFileContent(filePath, ext);

                    if (!isValid) {
                        this.log(`[HttpScraper] ERROR: File verification failed. Size: ${stats.size} bytes.`);

                        // Delete the invalid file
                        try {
                            await fs.promises.unlink(filePath);
                            this.log(`[HttpScraper] Deleted invalid file: ${filePath}`);
                        } catch (unlinkErr: any) {
                            this.log(`[HttpScraper] Failed to delete invalid file: ${unlinkErr.message}`);
                        }

                        resolve({ success: false, error: 'Downloaded file failed verification (Invalid signature or HTML error page).' });
                        return;
                    }

                    this.log(`[HttpScraper] Download complete: ${filePath} (Size: ${stats.size} bytes)`);
                    resolve({ success: true, filePath });
                });
                writer.on('error', (err) => {
                    this.log(`[HttpScraper] File write error: ${err.message}`);
                    reject({ success: false, error: err.message });
                });
            });

        } catch (error: any) {
            this.log(`[HttpScraper] Download error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}
