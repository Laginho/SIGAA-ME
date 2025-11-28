import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';

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

    constructor() { }

    setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>) {
        this.cookies = cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || new URL(this.baseUrl).hostname,
            path: c.path || '/'
        }));
        console.log('[HttpScraper] Cookies set. Count:', this.cookies.length);
        console.log('[HttpScraper] Cookie names:', this.cookies.map(c => c.name).join(', '));
    }

    private getCookieHeader(url: string): string {
        const urlObj = new URL(url);
        const validCookies = this.cookies.filter(cookie => {
            // Filter by path
            if (cookie.path && !urlObj.pathname.startsWith(cookie.path)) {
                return false;
            }
            // Filter by domain
            const requestDomain = urlObj.hostname;
            if (!requestDomain.endsWith(cookie.domain)) {
                return false;
            }
            // Filter by expiration
            if (cookie.expires && cookie.expires < new Date()) {
                return false;
            }
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
                // Remove existing cookie with same name/domain
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
            if (flag.match(/^Path=/i)) {
                cookie.path = flag.replace(/^Path=/i, '');
            } else if (flag.match(/^Domain=/i)) {
                cookie.domain = flag.replace(/^Domain=\.?/i, '');
            } else if (flag.match(/^Max-Age=/i)) {
                const maxAge = Number(flag.replace(/^Max-Age=/i, ''));
                cookie.expires = new Date(Date.now() + maxAge * 1000);
            } else if (flag.match(/^Expires=/i)) {
                cookie.expires = new Date(flag.replace(/^Expires=/i, ''));
            }
        }

        return cookie;
    }

    async getCourseFiles(courseId: string, courseName?: string, preFetchedHtml?: string): Promise<{ success: boolean; files?: any[]; news?: any[]; error?: string }> {
        try {
            if (this.cookies.length === 0) {
                return { success: false, error: 'No session cookies. Please login first.' };
            }

            console.log(`[HttpScraper] Fetching course page for ${courseName || courseId}...`);

            let coursePageData = '';
            let currentUrl = `${this.baseUrl}/sigaa/ava/index.jsf`;

            if (preFetchedHtml) {
                console.log('[HttpScraper] Using pre-fetched HTML from Playwright.');
                coursePageData = preFetchedHtml;
            } else {
                // Fallback: Try to fetch dashboard and enter course (Legacy/Flaky)
                console.warn('[HttpScraper] WARNING: No pre-fetched HTML provided. Falling back to HTTP entry (likely to fail).');

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

            // 2. Find "Conteúdo" link in the sidebar
            const $ = cheerio.load(coursePageData);
            let filesPageData = coursePageData;

            let conteudoLink: any = null;

            // Strategy 1: Direct text search (robust against encoding)
            $('.itemMenu').each((_, el) => {
                const text = $(el).text().trim();
                // Match "Conteúdo", "Conteudo", "Conte" (safe substring)
                if (text.includes(' Conte') || text.includes('nteudo')) {
                    console.log(`[HttpScraper] Found potential link: "${text}"`);
                    conteudoLink = $(el).parent('a');
                    return false; // break
                }
            });

            // Strategy 2: Look for "Materiais" header and traverse
            if (!conteudoLink) {
                console.log('[HttpScraper] Strategy 1 failed. Trying Strategy 2 (Materiais header)...');
                const materiaisHeader = $('.itemMenuHeaderMateriais');
                if (materiaisHeader.length > 0) {
                    const contentExterior = materiaisHeader.parent().find('.rich-panelbar-content-exterior');
                    const firstLink = contentExterior.find('a').first();
                    if (firstLink.length > 0) {
                        console.log('[HttpScraper] Found first link under Materiais.');
                        conteudoLink = firstLink;
                    }
                }
            }

            if (conteudoLink) {
                console.log('[HttpScraper] Found "Conteúdo" link in sidebar. Navigating to files...');
                const onclick = conteudoLink.attr('onclick');
                const match = onclick?.match(/jsfcljs\(document\.forms\['([^']+)'\],'([^']+)'/);

                if (match) {
                    const formName = match[1];
                    const paramsStr = match[2];

                    const form = $(`form[name="${formName}"]`);
                    const formData = new URLSearchParams();

                    // Add existing form hidden inputs
                    form.find('input').each((_, el) => {
                        const name = $(el).attr('name');
                        const value = $(el).attr('value');
                        if (name && value) formData.append(name, value);
                    });

                    // Add JSF params
                    const params = paramsStr.split(',');
                    for (let i = 0; i < params.length; i += 2) {
                        if (params[i] && params[i + 1]) {
                            formData.append(params[i], params[i + 1]);
                        }
                    }

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
                    console.log('[HttpScraper] Files page loaded.');
                } else {
                    console.log('[HttpScraper] Could not parse onclick for "Conteúdo" link.');
                }
            } else {
                console.log('[HttpScraper] "Conteúdo" link not found in sidebar. Scanning current page...');
            }

            // 3. Scrape files from the loaded page (filesPageData)
            const $files = cheerio.load(filesPageData);
            const files: any[] = [];
            const news: any[] = [];

            console.log('[HttpScraper] Scanning for files...');
            $files('a').each((_, el) => {
                const link = $files(el);
                const text = link.text().trim();
                const href = link.attr('href');
                const onclick = link.attr('onclick');

                if (text) {
                    // Check for file extensions or keywords
                    const isFile = text.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i) ||
                        text.toLowerCase().includes('lista') ||
                        text.toLowerCase().includes('exerc') ||
                        text.toLowerCase().includes('arquivo') ||
                        text.toLowerCase().includes('material');

                    if (isFile) {
                        if (onclick && onclick.includes('id')) {
                            const idMatch = onclick.match(/'id':'([^']+)'/);
                            if (idMatch) {
                                files.push({
                                    title: text,
                                    type: 'file',
                                    id: idMatch[1],
                                    script: onclick
                                });
                            }
                        } else if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                            files.push({
                                title: text,
                                type: 'link',
                                url: href.startsWith('http') ? href : this.baseUrl + href
                            });
                        }
                    }
                }
            });

            // Scrape news
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
                                    news.push({ title, date, notification, id: idMatch[1] });
                                }
                            }
                        }
                    });
                }
            });

            console.log(`[HttpScraper] Found ${files.length} files and ${news.length} news items.`);
            return { success: true, files, news };

        } catch (error: any) {
            console.error('[HttpScraper] Error fetching course files:', error);
            return { success: false, error: error.message };
        }
    }

    async getNewsDetail(courseId: string, newsId: string): Promise<{ success: boolean; news?: any; error?: string }> {
        try {
            const dashboardUrl = `${this.baseUrl}/sigaa/portais/discente/discente.jsf`;
            const dashboardResponse = await axios.get(dashboardUrl, {
                headers: {
                    'Cookie': this.getCookieHeader(dashboardUrl),
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': `${this.baseUrl}/sigaa/verPortalDiscente.do`,
                    'Connection': 'keep-alive'
                },
                timeout: 10000
            });

            this.updateCookies(dashboardResponse);
            console.log(`[HttpScraper] Dashboard loaded. Status: ${dashboardResponse.status}, Data length: ${dashboardResponse.data.length}`);
            if (dashboardResponse.data.length < 500) {
                console.log('[HttpScraper] Short response body:', dashboardResponse.data);
            }


            const $ = cheerio.load(dashboardResponse.data);
            let input = $(`input[name="idTurma"][value="${courseId}"]`);
            if (input.length === 0) {
                input = $(`input[name="id"][value="${courseId}"]`);
            }

            if (input.length === 0) {
                return { success: false, error: 'Course not found on dashboard' };
            }

            const form = input.closest('form');
            const formData = new URLSearchParams();
            form.find('input').each((_, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) formData.append(name, value);
            });

            const coursePageResponse = await axios.post(dashboardUrl, formData.toString(), {
                headers: {
                    'Cookie': this.getCookieHeader(dashboardUrl),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            this.updateCookies(coursePageResponse);

            const $course = cheerio.load(coursePageResponse.data);

            let targetForm: any = null;
            $course('a').each((_, el) => {
                const onclick = $(el).attr('onclick');
                if (onclick && onclick.includes(newsId)) {
                    targetForm = $(el).closest('form');
                }
            });

            if (!targetForm || targetForm.length === 0) {
                const hiddenInput = $course(`input[value="${newsId}"]`);
                if (hiddenInput.length > 0) {
                    targetForm = hiddenInput.closest('form');
                }
            }

            if (!targetForm || targetForm.length === 0) {
                targetForm = $course('form').first();
            }

            const newsFormData = new URLSearchParams();
            targetForm.find('input').each((_: any, el: any) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) newsFormData.append(name, value);
            });

            newsFormData.set('id', newsId);

            const newsResponse = await axios.post(dashboardUrl, newsFormData.toString(), {
                headers: {
                    'Cookie': this.getCookieHeader(dashboardUrl),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': dashboardUrl,
                    'Connection': 'keep-alive'
                },
                timeout: 10000
            });

            this.updateCookies(newsResponse);

            const $news = cheerio.load(newsResponse.data);

            const getTextAfterLabel = (label: string) => {
                let result = '';
                $news('td, th, label, span, div').each((_, el) => {
                    if ($news(el).text().trim().replace(':', '') === label) {
                        const parentTd = $news(el).closest('td');
                        if (parentTd.length && parentTd.next().length) {
                            result = parentTd.next().text().trim();
                            return false;
                        }
                        if ($news(el).next().length) {
                            result = $news(el).next().text().trim();
                            return false;
                        }
                    }
                });
                return result;
            };

            const getContent = () => {
                let result = '';
                $news('td, th, label, span, div').each((_, el) => {
                    if ($news(el).text().trim().replace(':', '') === 'Texto') {
                        const parentTd = $news(el).closest('td');
                        if (parentTd.length && parentTd.next().length) {
                            result = parentTd.next().html() || '';
                            return false;
                        }
                    }
                });
                return result;
            };

            const newsDetail = {
                title: getTextAfterLabel('Título') || getTextAfterLabel('Assunto'),
                date: getTextAfterLabel('Data'),
                content: getContent(),
                notification: getTextAfterLabel('Notificação')
            };

            return { success: true, news: newsDetail };

        } catch (error: any) {
            console.error('[HttpScraper] Error fetching news detail:', error);
            return { success: false, error: error.message };
        }
    }

    async downloadFile(
        courseId: string,
        fileId: string,
        fileName: string,
        basePath: string,
        onProgress?: (progress: number) => void
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        return { success: false, error: 'Not implemented yet' };
    }
}
