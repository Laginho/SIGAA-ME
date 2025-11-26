import axios from 'axios';
import * as cheerio from 'cheerio';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export class HttpScraperService {
    private cookies: string = '';
    private baseUrl: string = 'https://sigaa.unifei.edu.br'; // Adjust if needed, or extract from Playwright

    constructor() { }

    setCookies(cookies: Array<{ name: string; value: string }>) {
        // Convert Playwright cookies objects to a single Cookie header string
        this.cookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        console.log('[HttpScraper] Cookies set. Length:', this.cookies.length);
    }

    async getCourseFiles(courseId: string, courseName?: string): Promise<{ success: boolean; files?: any[]; news?: any[]; error?: string }> {
        try {
            if (!this.cookies) {
                return { success: false, error: 'No session cookies. Please login first.' };
            }

            console.log(`[HttpScraper] Fetching course page for ${courseName || courseId}...`);

            // We need to navigate to the course page. 
            // In SIGAA, usually you click a form/link to "enter" the course.
            // However, if we have the ID, maybe we can construct the URL or we might need to "enter" it via a POST request first if it's stateful.
            // SIGAA is often stateful (JSF). This is the tricky part of HTTP scraping.
            // If the URL contains the session state, we might need to grab the specific URL from the dashboard.

            // Assumption: We might need to rely on the "portal" page first or try to access the course URL directly if we have it.
            // BUT, Playwright `getCourseFiles` was navigating to `https://sigaa.unifei.edu.br/sigaa/portais/discente/discente.jsf` and then clicking.
            // To do this with HTTP, we need to replicate that flow or find a direct link.

            // WAIT. The Playwright service was finding the link on the dashboard.
            // We might need to pass the *URL* of the course, not just the ID, or the specific form parameters.

            // Let's look at how Playwright did it:
            // It clicked a link with `id` in `form`.
            // This submits a POST request to `https://sigaa.unifei.edu.br/sigaa/portais/discente/discente.jsf`.
            // The body contains `form_id`, `id`, `j_id_jsp_...`.

            // This is complex to replicate with Axios without parsing the dashboard first.
            // STRATEGY: 
            // 1. Fetch Dashboard (GET /sigaa/portais/discente/discente.jsf)
            // 2. Parse Dashboard to find the form for the course.
            // 3. Submit that form (POST) to enter the course.
            // 4. Then we are in the course page. Parse it.

            // Step 1: Fetch Dashboard
            const dashboardResponse = await axios.get(`${this.baseUrl}/sigaa/portais/discente/discente.jsf`, {
                headers: {
                    'Cookie': this.cookies,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            const $ = cheerio.load(dashboardResponse.data);

            // Step 2: Find the form/link for the course
            // We look for the input with value=courseId
            // SIGAA uses 'idTurma' for the course ID in the form
            const input = $(`input[name="idTurma"][value="${courseId}"]`);
            if (input.length === 0) {
                console.log(`[HttpScraper] Course input not found for ID ${courseId}. Dumping inputs:`, $('input[type="hidden"]').map((i, el) => $(el).attr('name') + '=' + $(el).attr('value')).get().join(', '));
                return { success: false, error: 'Course link not found on dashboard' };
            }

            const form = input.closest('form');
            if (form.length === 0) {
                return { success: false, error: 'Course form not found' };
            }

            // Extract form data
            const formData = new URLSearchParams();
            const formInputs = form.find('input');
            formInputs.each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) {
                    formData.append(name, value);
                }
            });

            // We also need to know WHICH button was "clicked". 
            // Usually SIGAA forms have a specific hidden input for the action, OR the submit button itself has a name/value.
            // The link usually triggers a JS function `f.submit()`.
            // So we just send the form data we found.

            // However, JSF often requires the `javax.faces.ViewState`.
            // The `formInputs` loop above should catch it.

            // Step 3: Enter Course
            console.log(`[HttpScraper] Entering course ${courseId}...`);
            const coursePageResponse = await axios.post(`${this.baseUrl}/sigaa/portais/discente/discente.jsf`, formData, {
                headers: {
                    'Cookie': this.cookies,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            const $course = cheerio.load(coursePageResponse.data);

            // Step 4: Parse Files and News
            const files: any[] = [];
            const news: any[] = [];

            // --- SCRAPE FILES ---
            // Look for links with file extensions
            $course('a').each((i, el) => {
                const link = $course(el);
                const text = link.text().trim();
                const href = link.attr('href');
                const onclick = link.attr('onclick');

                if (text && (
                    text.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i) ||
                    text.toLowerCase().includes('lista') ||
                    text.toLowerCase().includes('exerc')
                )) {
                    // Check if it's a real file link
                    if (onclick && onclick.includes('id')) {
                        // It's a JSF postback link (most common in SIGAA)
                        // We need to extract the ID to download it later
                        // Format: jsfcljs(document.forms['form'],{'id':'12345, ...})
                        const idMatch = onclick.match(/'id':'([^']+)'/);
                        if (idMatch) {
                            files.push({
                                title: text,
                                type: 'file',
                                id: idMatch[1],
                                script: onclick // Store the full script if needed
                            });
                        }
                    } else if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                        // Direct link
                        files.push({
                            title: text,
                            type: 'link',
                            url: href.startsWith('http') ? href : this.baseUrl + href
                        });
                    }
                }
            });

            // --- SCRAPE NEWS ---
            // Strategy 1: Sidebar/Table
            // Look for "Notícias" section or table
            // This depends on the specific layout. Let's try to find the table headers.

            // Find table with "Título" and "Data"
            $course('table').each((i, table) => {
                const headers = $course(table).find('th').map((j, th) => $course(th).text().trim()).get();
                if (headers.includes('Título') && headers.includes('Data')) {
                    // This is likely the news table
                    $course(table).find('tr').each((j, row) => {
                        const cells = $course(row).find('td');
                        if (cells.length >= 2) {
                            const title = $(cells[0]).text().trim();
                            const date = $(cells[1]).text().trim();
                            const notification = $(cells[2]).text().trim(); // Optional

                            // Find the ID/Link
                            const link = $(cells[0]).find('a');
                            const onclick = link.attr('onclick');

                            if (title && date && onclick) {
                                // Extract ID from onclick
                                // visualizarNoticia('form', '12345')
                                const idMatch = onclick.match(/['"](\d+)['"]/); // Simple number match
                                if (idMatch) {
                                    news.push({
                                        title,
                                        date,
                                        notification,
                                        id: idMatch[1]
                                    });
                                }
                            }
                        }
                    });
                }
            });

            console.log(`[HttpScraper] Found ${files.length} files and ${news.length} news items for course ${courseId}.`);
            return { success: true, files, news };

        } catch (error: any) {
            console.error('[HttpScraper] Error fetching course files:', error);
            return { success: false, error: error.message };
        }
    }

    async getNewsDetail(courseId: string, newsId: string): Promise<{ success: boolean; news?: any; error?: string }> {
        try {
            // To get news detail, we usually need to be IN the course page and then submit a form.
            // If we assume we are NOT in the course page (stateless), we need to enter it first.
            // Optimization: If we just called getCourseFiles, we might be in the session? 
            // No, HTTP is stateless unless we maintain a jar. Axios with cookies header is stateless per request 
            // unless the server maintains state via the JSESSIONID (which it does).
            // So if we send the same JSESSIONID, we *might* be on the last page we visited?
            // SIGAA is finicky. It's safer to "Enter Course" -> "Click News".

            // Step 1: Enter Course (Re-do logic or assume we can just post to the news link if we are "in" the portal?)
            // Actually, if we just send the POST request to `visualizarNoticia` endpoint, it might work if the server knows we are in the course.
            // But to be safe, let's re-enter the course.

            // Let's assume we need to fetch the dashboard first to get the fresh ViewState.
            const dashboardResponse = await axios.get(`${this.baseUrl}/sigaa/portais/discente/discente.jsf`, {
                headers: { 'Cookie': this.cookies }
            });

            // Check for redirect to login
            if (dashboardResponse.request?.res?.responseUrl?.includes('login') || dashboardResponse.data.includes('verTelaLogin')) {
                console.log('[HttpScraper] Session expired (redirected to login)');
                return { success: false, error: 'Session expired (redirected to login)' };
            }

            const $ = cheerio.load(dashboardResponse.data);

            // Debug: Log page title
            const pageTitle = $('title').text().trim();
            console.log(`[HttpScraper] Dashboard loaded. Title: "${pageTitle}"`);

            // SIGAA uses 'idTurma' for the course ID in the form
            // Try both 'id' and 'idTurma' just in case
            let input = $(`input[name="idTurma"][value="${courseId}"]`);
            if (input.length === 0) {
                input = $(`input[name="id"][value="${courseId}"]`);
            }

            if (input.length === 0) {
                console.log(`[HttpScraper] Course input not found for ID ${courseId} in getNewsDetail.`);
                console.log('[HttpScraper] Available hidden inputs:', $('input[type="hidden"]').map((i, el) => `${$(el).attr('name')}=${$(el).attr('value')}`).get().join(', '));
                return { success: false, error: 'Course not found on dashboard' };
            }

            const form = input.closest('form');
            const formData = new URLSearchParams();
            form.find('input').each((i, el) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) formData.append(name, value);
            });

            const coursePageResponse = await axios.post(`${this.baseUrl}/sigaa/portais/discente/discente.jsf`, formData, {
                headers: {
                    'Cookie': this.cookies,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // Step 2: Find the News Link/Form in the Course Page
            const $course = cheerio.load(coursePageResponse.data);

            // We need to find the form that contains the news ID or the link that submits it.
            // Usually: <a href="#" onclick="visualizarNoticia('formID','newsID')">
            // This submits the form 'formID' with extra params.

            // Let's look for the specific news ID in the page
            // The onclick usually looks like: `visualizarNoticia(form, 'ID')`
            // And `visualizarNoticia` sets a hidden input `id` to the value and submits.

            // We need to find the MAIN form of the page (usually `form_acessarTurmaVirtual` or similar, but inside the course it changes).
            // Let's find ANY form that has the hidden input `id` (if it exists) or just the main form.

            // In the sidebar news, it's often a separate form.
            // In the "Notícias" page, it's a table.

            // Generic approach: Find the form that would be submitted.
            // If we can't parse the JS, we might be stuck.
            // BUT, usually SIGAA uses a standard pattern:
            // Hidden input `id` gets updated.
            // Hidden input `j_id_jsp_...:hidden_button` gets clicked.

            // Let's try to find the link with the news ID in `onclick`.
            let targetForm: any = null;
            let submitScript = '';

            $course('a').each((i, el) => {
                const onclick = $(el).attr('onclick');
                if (onclick && onclick.includes(newsId)) {
                    submitScript = onclick;
                    targetForm = $(el).closest('form');
                }
            });

            if (!targetForm || targetForm.length === 0) {
                // Try finding a form with a hidden input with that value
                const hiddenInput = $course(`input[value="${newsId}"]`);
                if (hiddenInput.length > 0) {
                    targetForm = hiddenInput.closest('form');
                }
            }

            if (!targetForm || targetForm.length === 0) {
                // Fallback: Use the main form (usually the first big one)
                targetForm = $course('form').first();
            }

            // Construct the POST data for the news detail
            // We need to simulate what `visualizarNoticia` does.
            // Usually: sets `id` = newsId, and submits.
            // We also need the `javax.faces.ViewState`.

            const newsFormData = new URLSearchParams();
            targetForm.find('input').each((i: any, el: any) => {
                const name = $(el).attr('name');
                const value = $(el).attr('value');
                if (name && value) newsFormData.append(name, value);
            });

            // Update/Add the ID
            newsFormData.set('id', newsId);

            // We might need to set the "action" parameter.
            // Often it's `formName:j_id_jsp_...`.
            // This is the hardest part of generic JSF scraping.
            // If we can't find the exact parameter, we might fail.

            // HACK: Try to find the input that looks like a button/link action.
            // Or just submit and hope the `id` parameter is enough (sometimes it is).

            console.log(`[HttpScraper] Requesting news detail ${newsId}...`);
            const newsResponse = await axios.post(`${this.baseUrl}/sigaa/portais/discente/discente.jsf`, newsFormData, {
                headers: {
                    'Cookie': this.cookies,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const $news = cheerio.load(newsResponse.data);

            // Step 3: Parse Detail
            // Look for "Título", "Data", "Texto", "Notificação"
            // (Same logic as Playwright but with Cheerio)

            const getTextAfterLabel = (label: string) => {
                let result = '';
                $news('td, th, label, span, div').each((i, el) => {
                    if ($(el).text().trim().replace(':', '') === label) {
                        const parentTd = $(el).closest('td');
                        if (parentTd.length && parentTd.next().length) {
                            result = parentTd.next().text().trim();
                            return false; // break
                        }
                        if ($(el).next().length) {
                            result = $(el).next().text().trim();
                            return false;
                        }
                    }
                });
                return result;
            };

            const getContent = () => {
                let result = '';
                $news('td, th, label, span, div').each((i, el) => {
                    if ($(el).text().trim().replace(':', '') === 'Texto') {
                        const parentTd = $(el).closest('td');
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
        fileId: string, // We need the ID now, not just URL
        fileName: string,
        basePath: string,
        onProgress?: (progress: number) => void
    ): Promise<{ success: boolean; filePath?: string; error?: string }> {
        // This requires similar logic: Enter Course -> Submit Form with File ID.
        // And handling the response as a stream.
        return { success: false, error: 'Not implemented yet' };
    }
}
