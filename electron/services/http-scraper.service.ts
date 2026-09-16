import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger.service';
import { diagnosticsService } from './diagnostics.service';
import { sanitizeSegment, isInsideRoot } from './download-path';
import { MAX_DOWNLOAD_BYTES, fileNameFromContentDisposition, finalizeDownload } from './file-validation.service';
import type { AppErrorCode } from '../../shared/errors';
import { AVA, JSF, NEWS, jsfParam } from '../sigaa/selectors';
import {
    COURSE_FILES_SESSION_EXPIRED_MESSAGE,
    describeMissingAvaForm,
    isLoginDocument,
    parseAvaForm
} from '../sigaa/portal-adapter';

const log = logger.scope('HttpScraper');

/** Estratégias 1 e 2 de `getCourseFiles` reconheciam o mesmo arquivo por esta regex, duas vezes. */
const FILE_EXTENSION_PATTERN = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt|png|jpg|jpeg)$/i;

/**
 * Item 22 (CLEAN-008): `endsWith` puro aceitava `notsi3.ufc.br` como dono de
 * um cookie de `si3.ufc.br` — precisa do rótulo inteiro, não só do sufixo.
 */
export function cookieDomainMatches(requestHost: string, cookieDomain: string): boolean {
    return requestHost === cookieDomain || requestHost.endsWith(`.${cookieDomain}`);
}

/**
 * Arquivo como o parser o vê, com o que o main precisa para baixar. `script` e
 * `key` são internos do JSF e **não** atravessam o IPC: `SigaaService` reduz
 * isto a `CourseFile` (shared/domain.ts) antes de devolver.
 */
export interface ParsedFile {
    id: string;
    name: string;
    type: 'file' | 'link';
    /** `onclick` do JSF; só em `type: 'file'`. */
    script?: string;
    key?: string;
    /** Só em `type: 'link'`. */
    url?: string;
    date?: string;
}

export interface ParsedNews {
    id: string;
    title: string;
    date: string;
    notification: string;
    /** `onclick` do JSF. Não atravessa o IPC. */
    script: string;
}

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
    private courseData: Map<string, { viewState: string; action: string; formName: string; inputs: Record<string, string> }> = new Map();

    setCookies(cookies: Array<{ name: string; value: string; domain?: string; path?: string }>) {
        this.cookies = cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain || new URL(this.baseUrl).hostname,
            path: c.path || '/'
        }));
        log.info(`Cookies set. Count: ${this.cookies.length}`);
    }

    /**
     * Zera o que amarra esta instância a uma sessão JSF: cookies e os
     * ViewStates por turma. Chamado por `SigaaService` na troca de conta e no
     * logout (DATA-001) — sem isso o catálogo da conta anterior continuaria
     * sendo usado para montar requisições da conta nova.
     */
    resetSession() {
        this.cookies = [];
        this.courseData.clear();
        log.info('Session reset (cookies and course ViewStates cleared).');
    }

    private getCookieHeader(url: string): string {
        const urlObj = new URL(url);
        const validCookies = this.cookies.filter(cookie => {
            if (cookie.path && !urlObj.pathname.startsWith(cookie.path)) return false;
            const requestDomain = urlObj.hostname;
            if (!cookieDomainMatches(requestDomain, cookie.domain)) return false;
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
        log.info('User-Agent set.');
    }

    /**
     * Ao falhar a atualização de uma turma, os dados JSF anteriores dessa
     * turma não podem sobreviver para o próximo download: sem isto, o POST
     * seguinte reaproveita um ViewState velho como se ainda fosse válido.
     * Sessão expirada invalida o catálogo inteiro — não só a turma corrente,
     * já que a sessão sob todas elas caiu junto.
     */
    private failCourse(courseId: string, errorCode: AppErrorCode, error: string): { success: false; error: string; errorCode: AppErrorCode } {
        if (errorCode === 'SESSION_EXPIRED') {
            this.courseData.clear();
        } else {
            this.courseData.delete(courseId);
        }
        return { success: false, error, errorCode };
    }

    async getCourseFiles(courseId: string, courseName: string | undefined, preFetchedHtml: string): Promise<{ success: boolean; files?: ParsedFile[]; news?: ParsedNews[]; error?: string; errorCode?: AppErrorCode }> {
        try {
            if (this.cookies.length === 0) {
                return this.failCourse(courseId, 'SESSION_EXPIRED', 'No session cookies. Please login first.');
            }

            log.info(`Fetching course page for course ${courseId}.`, { courseName });
            log.info(`Using pre-fetched HTML from Playwright. Length: ${preFetchedHtml.length}`);

            const coursePageData = preFetchedHtml;
            const $ = cheerio.load(coursePageData);
            log.info('Pre-fetched page title.', { title: $('title').text().trim() });

            const filesPageData = coursePageData;

            if (isLoginDocument(coursePageData)) {
                return this.failCourse(courseId, 'SESSION_EXPIRED', COURSE_FILES_SESSION_EXPIRED_MESSAGE);
            }

            diagnosticsService.saveRaw(`debug_playwright_${courseId}.html`, preFetchedHtml);
            log.info('Using Playwright HTML directly.');

            // --- Common logic for parsing files page ---
            const $files = cheerio.load(filesPageData);

            // O formulário AVA precisa ser reconhecido por nome, com ViewState não
            // vazio — sem fallback para o primeiro formulário da página.
            const avaForm = parseAvaForm(filesPageData);
            if (!avaForm) {
                return this.failCourse(courseId, 'SELECTOR_DRIFT', describeMissingAvaForm(filesPageData));
            }

            this.courseData.set(courseId, avaForm);
            log.info(`Stored ViewState and ${Object.keys(avaForm.inputs).length} inputs for course ${courseId}.`);

            const files: ParsedFile[] = [];
            const news: ParsedNews[] = [];

            log.info('Scanning for files.');
            $files('a').each((_, el) => {
                const link = $files(el);
                const text = link.text().trim();
                const onclick = link.attr('onclick');
                const href = link.attr('href');

                // BUG-011: tarefa usa o mesmo `jsfcljs(...,id,...)` que arquivo; só o
                // componente muda (`idEnviarMaterialTarefa` × `idInserirMaterialArquivo`).
                // Baixá-la devolve a página "Responder tarefa", que a verificação
                // rejeita e o fallback Playwright tenta de novo, em vão.
                // ponytail: só tarefa é conhecida; questionário/fórum entram aqui quando aparecerem numa fixture.
                if (onclick?.includes('idEnviarMaterialTarefa')) return;

                // Strategy 1: Detect files by onclick pattern (jsfcljs with id parameter)
                if (onclick && onclick.includes('jsfcljs') && onclick.includes(',id,')) {
                    const id = jsfParam(onclick, 'id');
                    const key = jsfParam(onclick, 'key');

                    if (id) {
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
                                if (cellText.match(FILE_EXTENSION_PATTERN)) {
                                    fileName = cellText;
                                    return false; // break
                                }
                            });
                        }

                        files.push({
                            name: fileName,
                            type: 'file',
                            id,
                            key,
                            script: onclick
                        });
                    }
                }
                // Strategy 2: Detect files by explicit filename patterns (legacy)
                else if (text && (text.match(FILE_EXTENSION_PATTERN) ||
                    text.toLowerCase().includes('lista') ||
                    text.toLowerCase().includes('exerc') ||
                    text.toLowerCase().includes('arquivo') ||
                    text.toLowerCase().includes('material'))) {

                    if (onclick && onclick.includes('id')) {
                        const id = jsfParam(onclick, 'id');
                        const key = jsfParam(onclick, 'key');

                        if (id) {
                            files.push({
                                name: text,
                                type: 'file',
                                id,
                                key,
                                script: onclick
                            });
                        }
                    } else if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                        const url = href.startsWith('http') ? href : this.baseUrl + href;
                        files.push({
                            name: text,
                            type: 'link',
                            // Deterministic id so cache diffing and notifications can see
                            // link materials; id-less items are invisible to diffCourseState.
                            id: `link:${url}`,
                            url
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
                                // Era /['"](\\d+)['"]/ — dentro de literal de regex, `\\d` é
                                // barra invertida seguida de "d", não dígito. Nunca casava, e
                                // esta estratégia devolvia zero notícia silenciosamente. O id
                                // vem do onclick do JSF como `...,id,777,...`.
                                const id = jsfParam(onclick, 'id');
                                if (id) {
                                    news.push({
                                        title,
                                        date,
                                        notification,
                                        id,
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
                                const rawText = $(element).text();
                                const cleanText = rawText.replace(/\s+/g, ' ').trim();
                                // Match date format dd/mm/yyyy hh:mm or just dd/mm/yyyy
                                // Example: "02/12/2025 22:24"
                                const dateMatch = cleanText.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?)/);
                                if (dateMatch) {
                                    currentDate = dateMatch[1];
                                }
                            }
                            // Check for title in italics
                            else if (element.type === 'tag' && element.tagName === 'i') {
                                currentTitle = $(element).text().replace(/\s+/g, ' ').trim();
                            }
                            // Check for form with ID
                            else if (element.type === 'tag' && element.tagName === 'form') {
                                const form = $(element);
                                const idInput = form.find(NEWS.idInput).val();

                                // Extract onclick script from the form's link (needed for HTTP fetching)
                                const formLink = form.find('a');
                                const onclick = formLink.attr('onclick') || '';

                                if (idInput && currentDate && currentTitle) {
                                    news.push({
                                        title: currentTitle,
                                        date: currentDate,
                                        id: String(idInput),
                                        notification: '',
                                        script: onclick  // Include the script for HTTP-based fetching
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

            log.info(`Found ${fileEvents.length} file events in timeline.`);

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
                }
            });

            log.info(`Found ${files.length} files and ${news.length} news items for course ${courseId}.`);

            return { success: true, files, news };

        } catch (error: any) {
            log.error('Error fetching course files.', { error });
            // Exceção também é falha de atualização: o ViewState anterior desta
            // turma não pode sobreviver para o próximo download (ver failCourse).
            // Sem `errorCode`, para `failFromResult` ainda classificar timeout de
            // rede como PORTAL_UNAVAILABLE pela mensagem.
            this.courseData.delete(courseId);
            return { success: false, error: error.message };
        }
    }

    async downloadFile(
        courseId: string,
        fileId: string,
        fileName: string,
        basePath: string,
        script: string,
        onProgress?: (progress: number) => void
    ): Promise<
        | { success: true; filePath: string }
        | { success: false; error: string; errorCode?: AppErrorCode }
    > {
        try {
            log.info(`Downloading file ${fileId} for course ${courseId}.`, { fileName });

            const courseInfo = this.courseData.get(courseId);
            if (!courseInfo) {
                // Sem catálogo JSF para a turma — ou nunca houve, ou uma atualização
                // anterior falhou e o invalidou (failCourse). Relogar/atualizar resolve.
                return { success: false, error: 'Course session data not found. Please refresh the course list.', errorCode: 'SESSION_EXPIRED' };
            }

            // Extract component ID from script
            const match = script.match(JSF.scriptParamsPattern);
            if (!match) {
                return { success: false, error: 'Invalid download script format', errorCode: 'SELECTOR_DRIFT' };
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
            formData.set(AVA.viewStateField, courseInfo.viewState);

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

            log.info(`Sending download request. ComponentID: ${componentId}.`);

            const response = await axios.post(`${this.baseUrl}${courseInfo.action}`, formData.toString(), {
                headers: {
                    'Cookie': this.getCookieHeader(`${this.baseUrl}${courseInfo.action}`),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': this.userAgent,
                    'Referer': `${this.baseUrl}${courseInfo.action}`,
                    'Connection': 'keep-alive'
                },
                responseType: 'stream',
                timeout: 60000 // 60s timeout for downloads
            });

            this.updateCookies(response);

            const contentTypeHeader = response.headers['content-type'];
            const contentType: string | undefined = typeof contentTypeHeader === 'string' ? contentTypeHeader : undefined;
            const contentLengthHeader = response.headers['content-length'];
            const contentLength = parseInt(typeof contentLengthHeader === 'string' ? contentLengthHeader : '0', 10);
            const contentDispositionHeader = response.headers['content-disposition'];
            const hintFileName = fileNameFromContentDisposition(typeof contentDispositionHeader === 'string' ? contentDispositionHeader : undefined);

            log.info(`Response headers. Content-Length=${response.headers['content-length']}.`, { contentType });

            // DL-002: teto antes de tocar disco. Um Content-Length maior que o
            // limite é recusado sem criar o `.part`, e o stream é destruído para
            // não continuar puxando dados que não vamos usar.
            if (contentLength > MAX_DOWNLOAD_BYTES) {
                log.warn(`Rejecting download: Content-Length ${contentLength} exceeds ${MAX_DOWNLOAD_BYTES}.`);
                response.data.destroy();
                return { success: false, error: `Arquivo excede o limite de ${MAX_DOWNLOAD_BYTES} bytes` };
            }

            // DL-001: nome vem do usuário/UI, sanitizado antes de tocar disco.
            // A extensão final (dica do servidor, MIME, ou conteúdo) só é
            // decidida depois do download, em `finalizeDownload`.
            const safeFileName = sanitizeSegment(fileName, 150);
            if (!isInsideRoot(basePath, path.join(basePath, safeFileName))) {
                throw new Error('Nome de arquivo/pasta inválido');
            }

            // BUG-001: o download vai para `.part` e só ganha o nome definitivo
            // depois de verificado. Um download interrompido nunca deixa um
            // arquivo com o nome final no lugar.
            const partPath = path.join(basePath, safeFileName + '.part');
            const writer = fs.createWriteStream(partPath);

            let downloadedLength = 0;
            let tooLarge = false;

            const descartarParcial = async (motivo: string) => {
                try {
                    await fs.promises.unlink(partPath);
                    log.info(`Discarded partial file (${motivo}).`, { path: partPath });
                } catch (unlinkErr) {
                    log.warn('Failed to discard partial file.', { error: unlinkErr });
                }
            };

            response.data.on('data', (chunk: any) => {
                downloadedLength += chunk.length;
                if (onProgress && contentLength > 0) {
                    onProgress(Math.round((downloadedLength / contentLength) * 100));
                }
                // DL-002: sem Content-Length (chunked), o teto só pode ser
                // vigiado durante o streaming — um corpo sem fim encheria o disco.
                if (!tooLarge && downloadedLength > MAX_DOWNLOAD_BYTES) {
                    tooLarge = true;
                    log.warn(`Aborting download: streamed bytes exceeded ${MAX_DOWNLOAD_BYTES}.`);
                    response.data.destroy(new Error(`Arquivo excede o limite de ${MAX_DOWNLOAD_BYTES} bytes`));
                }
            });

            response.data.pipe(writer);

            return new Promise((resolve) => {
                writer.on('finish', async () => {
                    if (tooLarge) return; // resolvido pelo handler de erro do stream
                    try {
                        const result = await finalizeDownload({
                            partPath,
                            dir: basePath,
                            fileName: safeFileName,
                            hintFileName,
                            contentType
                        });

                        if (result.ok) {
                            log.info('Download complete.', { filePath: result.filePath });
                            resolve({ success: true, filePath: result.filePath });
                        } else {
                            log.warn(`Validation failed (${result.reason}).`, { error: result.error });
                            resolve({ success: false, error: result.error });
                        }
                    } catch (err) {
                        // Falha ao ler, validar ou renomear. O parcial não pode
                        // ficar para trás se apresentando como download bom.
                        const message = err instanceof Error ? err.message : String(err);
                        log.error('Post-download error.', { error: err });
                        resolve({ success: false, error: message });
                    }
                });
                writer.on('error', async (err) => {
                    log.error('File write error.', { error: err });
                    await descartarParcial('erro de escrita');
                    resolve({ success: false, error: err.message });
                });
                // Erro NA ORIGEM (conexão caiu, ou o teto de tamanho abortou o
                // stream). Sem isto o `writer` nunca emite `finish` nem `error`, e
                // esta Promise nunca resolve. `pipe()` não propaga erro do source
                // para o destino.
                response.data.on('error', (err: Error) => {
                    log.error('Download stream error.', { error: err });
                    writer.destroy();
                    writer.once('close', async () => {
                        await descartarParcial('conexão interrompida');
                        resolve({ success: false, error: err.message });
                    });
                });
            });

        } catch (error: any) {
            log.error('Download error.', { error });
            return { success: false, error: error.message };
        }
    }
}
