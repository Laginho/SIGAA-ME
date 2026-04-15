/**
 * Unit Tests: HTTP Scraper Parser
 *
 * These tests validate that our Cheerio-based parsing logic
 * correctly extracts files, news, and form data from SIGAA HTML.
 *
 * They use static HTML fixtures so they are:
 * - Fast (no network requests)
 * - Stable (not affected by SIGAA website changes)
 * - Runnable by anyone (no credentials needed)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as cheerio from 'cheerio';

// === Mock `electron` so the service can be imported outside Electron ===
vi.mock('electron', () => ({
    app: {
        getPath: () => '/tmp/sigaa-me-test',
    },
}));

// === Mock `fs` to prevent log file creation during tests ===
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>();
    return {
        ...actual,
        createWriteStream: () => ({
            write: vi.fn(),
            writable: true,
            on: vi.fn(),
        }),
    };
});

// ============================================================
// PARSER HELPER (extracted from http-scraper.service.ts logic)
// These functions mirror the parsing logic in the service,
// allowing us to test them without instantiating the full class.
// ============================================================

/**
 * Parses a course files page and returns files and news.
 * Mirrors the logic inside HttpScraperService.getCourseFiles()
 */
function parseCoursePage(html: string): { files: any[]; news: any[] } {
    const $ = cheerio.load(html);
    const files: any[] = [];
    const news: any[] = [];

    $('a').each((_, el) => {
        const link = $(el);
        const text = link.text().trim();
        const onclick = link.attr('onclick');
        const href = link.attr('href');

        // Strategy 1: jsfcljs onclick with ,id,
        if (onclick && onclick.includes('jsfcljs') && onclick.includes(',id,')) {
            const idMatch = onclick.match(/,id,([^,'"]+)/);
            if (idMatch) {
                let fileName = text;
                const row = link.closest('tr');
                if (row.length > 0) {
                    const cells = $(row).find('td');
                    cells.each((_, cell) => {
                        const cellText = $(cell).text().trim();
                        if (cellText.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar)$/i)) {
                            fileName = cellText;
                            return false;
                        }
                    });
                }
                files.push({ name: fileName, type: 'file', id: idMatch[1], script: onclick });
            }
        }
        // Strategy 2: explicit file extension in link text
        else if (text && text.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar)$/i)) {
            if (onclick) {
                const idMatch = onclick.match(/,id,([^,]+)/);
                if (idMatch) {
                    files.push({ name: text, type: 'file', id: idMatch[1], script: onclick });
                }
            } else if (href && !href.startsWith('#')) {
                files.push({ name: text, type: 'link', url: href });
            }
        }
    });

    // News parsing
    $('table').each((_, table) => {
        const headers = $(table).find('th').map((__, th) => $(th).text().trim()).get();
        if (headers.includes('Título') && headers.includes('Data')) {
            $(table).find('tr').each((__, row) => {
                const cells = $(row).find('td');
                if (cells.length >= 2) {
                    const title = $(cells[0]).text().trim();
                    const date = $(cells[1]).text().trim();
                    const link = $(cells[0]).find('a');
                    const onclick = link.attr('onclick');
                    if (title && date && onclick) {
                        const idMatch = onclick.match(/,id,([^,'"]+)/);
                        if (idMatch) {
                            news.push({ title, date, id: idMatch[1], script: onclick });
                        }
                    }
                }
            });
        }
    });

    return { files, news };
}

// ============================================================
// HTML FIXTURES (minimal, realistic HTML snippets)
// ============================================================

const COURSE_PAGE_WITH_FILES = `
<html><body>
  <form name="formAva" action="/sigaa/ava/index.jsf">
    <input name="javax.faces.ViewState" value="VIEWSTATE123" />
    <table>
      <tr>
        <td><input type="hidden" name="idTurma" value="99999" />
          <a id="turmaVirtual_99999" href="#" onclick="jsfcljs(document.forms['formAva'],'formAva:acessar,formAva:acessar','');">Cálculo I</a>
        </td>
      </tr>
    </table>
    <!-- Files table -->
    <table>
      <tr>
        <td>Lista 3.pdf</td>
        <td><a href="#" onclick="jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,555','');">Download</a></td>
      </tr>
      <tr>
        <td>Exercicios.docx</td>
        <td><a href="#" onclick="jsfcljs(document.forms['formAva'],'formAva:download,formAva:download,id,556','');">Download</a></td>
      </tr>
    </table>
  </form>
</body></html>
`;

const COURSE_PAGE_WITH_NEWS = `
<html><body>
  <table>
    <tr><th>Título</th><th>Data</th></tr>
    <tr>
      <td><a href="#" onclick="jsfcljs(document.forms['f'],'f:news,f:news,id,777','');">Prova Remarcada</a></td>
      <td>10/04/2026</td>
    </tr>
    <tr>
      <td><a href="#" onclick="jsfcljs(document.forms['f'],'f:news,f:news,id,778','');">Aula Cancelada</a></td>
      <td>11/04/2026</td>
    </tr>
  </table>
</body></html>
`;

const EMPTY_COURSE_PAGE = `
<html><body>
  <form name="formAva" action="/sigaa/ava/index.jsf">
    <input name="javax.faces.ViewState" value="VIEWSTATE_EMPTY" />
    <p>Seu professor ainda não adicionou conteúdo.</p>
  </form>
</body></html>
`;

// ============================================================
// TESTS
// ============================================================

describe('HTML Parser — Files', () => {
    it('extracts files with jsfcljs onclick pattern', () => {
        const { files } = parseCoursePage(COURSE_PAGE_WITH_FILES);
        expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts the correct file IDs', () => {
        const { files } = parseCoursePage(COURSE_PAGE_WITH_FILES);
        const ids = files.map(f => f.id);
        expect(ids).toContain('555');
        expect(ids).toContain('556');
    });

    it('extracts the correct file names from table cells', () => {
        const { files } = parseCoursePage(COURSE_PAGE_WITH_FILES);
        const names = files.map(f => f.name);
        expect(names).toContain('Lista 3.pdf');
        expect(names).toContain('Exercicios.docx');
    });

    it('returns an empty files array for an empty course page', () => {
        const { files } = parseCoursePage(EMPTY_COURSE_PAGE);
        expect(files).toHaveLength(0);
    });
});

describe('HTML Parser — News', () => {
    it('detects news items in a Título/Data table', () => {
        const { news } = parseCoursePage(COURSE_PAGE_WITH_NEWS);
        expect(news.length).toBe(2);
    });

    it('extracts the correct news IDs', () => {
        const { news } = parseCoursePage(COURSE_PAGE_WITH_NEWS);
        expect(news[0].id).toBe('777');
        expect(news[1].id).toBe('778');
    });

    it('extracts the correct news titles', () => {
        const { news } = parseCoursePage(COURSE_PAGE_WITH_NEWS);
        expect(news[0].title).toBe('Prova Remarcada');
        expect(news[1].title).toBe('Aula Cancelada');
    });

    it('extracts the correct news dates', () => {
        const { news } = parseCoursePage(COURSE_PAGE_WITH_NEWS);
        expect(news[0].date).toBe('10/04/2026');
    });

    it('returns empty news array for a page with no news', () => {
        const { news } = parseCoursePage(EMPTY_COURSE_PAGE);
        expect(news).toHaveLength(0);
    });
});

describe('HTML Parser — ViewState', () => {
    it('finds the ViewState hidden input', () => {
        const $ = cheerio.load(COURSE_PAGE_WITH_FILES);
        const viewState = $('input[name="javax.faces.ViewState"]').val();
        expect(viewState).toBe('VIEWSTATE123');
    });

    it('finds the correct form action', () => {
        const $ = cheerio.load(COURSE_PAGE_WITH_FILES);
        const action = $('form[name="formAva"]').attr('action');
        expect(action).toBe('/sigaa/ava/index.jsf');
    });
});
