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
            return result;
        };

        const newsDetail = {
            title: getTextAfterLabel('Título') || getTextAfterLabel('Assunto'),
            date: getTextAfterLabel('Data'),
            content: getContent(),
            notification: getTextAfterLabel('Notificação')
        };

        return { success: true, news: newsDetail };

    } catch(error: any) {
        console.error('[HttpScraper] Error fetching news detail:', error);
        return { success: false, error: error.message };
    }
}

    async downloadFile(
    courseId: string,
    fileId: string, // We need the ID now, not just URL
    fileName: string,
    basePath: string,
    onProgress ?: (progress: number) => void
    ): Promise < { success: boolean; filePath?: string; error?: string } > {
    // This requires similar logic: Enter Course -> Submit Form with File ID.
    // And handling the response as a stream.
    return { success: false, error: 'Not implemented yet' };
}
}
