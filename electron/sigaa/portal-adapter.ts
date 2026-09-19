/**
 * Aplica as regras de compatibilidade do SIGAA às operações dos dois serviços
 * de transporte (PORTAL-001). Cada função aqui decide se um documento pode
 * ser usado para a próxima ação (preencher, clicar, enviar POST, interpretar
 * dado) ou se a operação deve falhar com um `AppErrorCode` estável.
 */

import * as cheerio from 'cheerio';
import type { AppErrorCode } from '../../shared/errors';
import { AVA, LOGIN_SELECTOR_LABELS, STUDENT_PORTAL } from './selectors';
import type { AvaForm, PortalCheck, PortalError } from './portal-contracts';
import { portalError } from './portal-contracts';
import { isAccessDenied, isAuthenticatedLanding, isLoginDocument, isMaintenance, isStudentHome, isStudentPortal } from './portal-state-classifier';

export { isLoginDocument, isStudentHome, isStudentPortal, isAuthenticatedLanding, isMaintenance, isAccessDenied, hasRecognizedAvaForm, classify } from './portal-state-classifier';
export { LOGIN_SELECTOR_LABELS } from './selectors';
export type { PortalError, PortalCheck, PortalState, AvaForm } from './portal-contracts';
export { PORTAL_ADAPTER_VERSION, portalError } from './portal-contracts';

export const COURSE_FILES_SESSION_EXPIRED_MESSAGE =
    'Session expired: SIGAA returned the login page instead of course content. Re-authenticate before requesting files.';

/**
 * Formulário AVA reconhecido com ViewState não vazio. Sem fallback para o
 * primeiro formulário da página — `form[name="formAva"]` ou nada.
 */
export function parseAvaForm(html: string): AvaForm | null {
    const $ = cheerio.load(html);
    const form = $(AVA.formSelector);
    if (form.length === 0) return null;
    const viewState = form.find(AVA.viewStateSelector).val();
    if (typeof viewState !== 'string' || viewState.length === 0) return null;

    const inputs: Record<string, string> = {};
    form.find('input').each((_, el) => {
        const name = $(el).attr('name');
        const value = $(el).attr('value');
        if (name && value !== undefined) inputs[name] = value;
    });

    return {
        viewState,
        action: form.attr('action') || '/sigaa/ava/index.jsf',
        formName: form.attr('name') || AVA.formName,
        inputs
    };
}

export function describeMissingAvaForm(html: string): string {
    const $ = cheerio.load(html);
    const form = $(AVA.formSelector);
    const hasViewState = form.length > 0 && !!form.find(AVA.viewStateSelector).val();
    const missing = [
        !hasViewState ? AVA.viewStateSelector : null,
        form.length === 0 ? `${AVA.formSelector} (or another recognized course form)` : null
    ].filter(Boolean).join(', ');
    return `SIGAA course selector drift: required JSF structure is missing (${missing}). The page may no longer be a course files page.`;
}

/** Documento inicial da entrada de turma via HTTP: portal do discente esperado. */
export function validateCourseListDocument(html: string): PortalCheck {
    if (isLoginDocument(html)) {
        return portalError('SESSION_EXPIRED', 'Session expired: SIGAA returned the login page instead of the student portal.');
    }
    if (isStudentPortal(html) || isStudentHome(html)) return null;
    if (isMaintenance(html)) {
        return portalError('PORTAL_UNAVAILABLE', 'SIGAA portal unavailable: scheduled maintenance page returned instead of the student portal.');
    }
    if (isAccessDenied(html)) {
        return portalError('SESSION_EXPIRED', 'Session expired: SIGAA denied access to the student portal.');
    }
    return portalError(
        'SELECTOR_DRIFT',
        `SIGAA portal selector drift: the student portal structure (${STUDENT_PORTAL.courseIdInput}) was not found. The portal layout may have changed.`
    );
}

/**
 * Linha da lista de turmas como o portal a entrega. `href`/`onclick` são
 * internos do JSF e **não** atravessam o IPC: `SigaaService` reduz isto a
 * `CourseSummary` (shared/domain.ts). `code` fica vazio quando o texto do
 * link não tem o separador ` - ` (PORTAL-013); `period`, quando a célula não
 * existe.
 */
export interface ParsedCourse {
    id: string;
    code: string;
    name: string;
    period: string;
    href: string | null;
    onclick: string | null;
}

/** `type`, não `interface`: precisa casar com o `Record<string, number>` do diagnóstico estrutural. */
export type CourseListSelectorCounts = {
    courseIdInputs: number;
    virtualClassroomLinks: number;
};

export type CourseListExtraction =
    | { success: true; courses: ParsedCourse[]; degraded: number; selectorCounts: CourseListSelectorCounts }
    | { success: false; error: PortalError; selectorCounts: CourseListSelectorCounts };

/**
 * Extrai a lista de turmas do HTML do portal (PORTAL-013). Candidata é a `tr`
 * mais próxima do input de id dentro do painel de turmas do semestre;
 * toda candidata vira turma ou derruba a operação —
 * não existe "ignorar". Sem ` - ` no texto do link é degradação (`code`
 * vazio, `name` inteiro, contada em `degraded`); sem link ou com texto vazio
 * é `SELECTOR_DRIFT`: os seletores existem, a estrutura que os relaciona
 * mudou — assim como o painel sumir com linhas de turma ainda na página.
 * Zero candidatas sem nenhuma linha é sucesso com lista vazia — quem decide
 * entre `NOT_FOUND`, sessão e manutenção é `validateCourseListDocument`.
 */
export function extractCourseList(html: string): CourseListExtraction {
    const $ = cheerio.load(html);
    const panel = $(STUDENT_PORTAL.coursesPanel);
    const courseInputs = panel.find(STUDENT_PORTAL.courseIdInput);
    const selectorCounts: CourseListSelectorCounts = {
        courseIdInputs: courseInputs.length,
        virtualClassroomLinks: panel.find(STUDENT_PORTAL.virtualClassroomLink).length
    };
    // Painel ausente com linhas de turma na página é deriva, não conta vazia:
    // sem isto o ramo de zero turmas devolveria NOT_FOUND ("sessão"), porque
    // `isStudentPortal` acha os dois seletores fora do painel.
    if (panel.length === 0 && $(STUDENT_PORTAL.courseIdInput).length > 0) {
        return {
            success: false,
            selectorCounts,
            error: portalError(
                'SELECTOR_DRIFT',
                `SIGAA portal selector drift: the semester course panel (${STUDENT_PORTAL.coursesPanel}) is missing, but the page still has ${STUDENT_PORTAL.courseIdInput} rows. The portal layout may have changed.`
            )
        };
    }
    const candidates = courseInputs.closest('tr');

    const courses: ParsedCourse[] = [];
    let degraded = 0;
    let unparsed = 0;
    candidates.each((_, row) => {
        const $row = $(row);
        const link = $row.find(STUDENT_PORTAL.virtualClassroomLink).first();
        const fullText = link.text().trim();
        const id = $row.find(STUDENT_PORTAL.courseIdInput).first().attr('value')?.trim();
        if (!id || link.length === 0 || fullText.length === 0) {
            unparsed++;
            return;
        }
        const separator = fullText.indexOf(' - ');
        if (separator === -1) degraded++;
        const periodCell = $row.find('td.info center').first();
        periodCell.find('br').replaceWith('\n');
        const periodText = periodCell.text().trim();
        courses.push({
            id,
            code: separator === -1 ? '' : fullText.slice(0, separator).trim(),
            name: separator === -1 ? fullText : fullText.slice(separator + 3).trim(),
            period: periodText.split('\n')[0].trim(),
            href: link.attr('href') ?? null,
            onclick: link.attr('onclick') ?? null
        });
    });

    if (unparsed > 0) {
        return {
            success: false,
            selectorCounts,
            error: portalError(
                'SELECTOR_DRIFT',
                `SIGAA portal selector drift: ${unparsed} de ${candidates.length} linhas de turma não foram interpretadas (missing course id or usable ${STUDENT_PORTAL.virtualClassroomLink}). The portal layout may have changed.`
            )
        };
    }
    return { success: true, courses, degraded, selectorCounts };
}

export function describeMissingCourseListSelectors(courseIdInputs: number, virtualClassroomLinks: number): string {
    const missing = [
        courseIdInputs === 0 ? STUDENT_PORTAL.courseIdInput : null,
        virtualClassroomLinks === 0 ? STUDENT_PORTAL.virtualClassroomLink : null
    ].filter(Boolean).join(', ');
    return `SIGAA portal selector drift: the course list is missing ${missing}. The portal layout may have changed.`;
}

/** Documento inicial do login: precisa do campo de usuário reconhecido antes de preencher qualquer coisa. */
export function validateLoginStart(html: string): PortalCheck {
    if (isLoginDocument(html)) return null;
    return portalError(
        'SELECTOR_DRIFT',
        'SIGAA login selector drift: the login page did not present the expected username field. The SIGAA login page may have changed.'
    );
}

export type LoginEndState = 'authenticated' | 'still-login' | 'unrecognized';

/** Documento final do login: só autentica com um pouso reconhecido (home ou portal). */
export function classifyLoginEnd(html: string): LoginEndState {
    if (isAuthenticatedLanding(html)) return 'authenticated';
    if (isLoginDocument(html)) return 'still-login';
    return 'unrecognized';
}

/**
 * Traduz uma falha de `page.fill`/`page.click` do login num erro estável.
 * Selector timeout nos três campos conhecidos vira drift; timeout genérico
 * vira indisponibilidade; o resto sobe como está, para `failFromMessage`
 * classificar pela mensagem.
 */
export function classifyLoginException(error: unknown): { message: string; errorCode?: AppErrorCode } {
    const message = error instanceof Error ? error.message : String(error);
    const selector = LOGIN_SELECTOR_LABELS.find(([candidate]) => message.includes(candidate));

    if (selector) {
        return {
            errorCode: 'SELECTOR_DRIFT',
            message: `SIGAA login selector drift: the ${selector[1]} (${selector[0]}) was not found or did not become usable. The SIGAA login page may have changed. Playwright: ${message}`
        };
    }
    if (/timeout/i.test(message)) {
        return {
            errorCode: 'PORTAL_UNAVAILABLE',
            message: `SIGAA login navigation timed out. Check portal availability or recent page changes. Playwright: ${message}`
        };
    }
    return { message };
}
