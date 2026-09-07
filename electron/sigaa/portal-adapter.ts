/**
 * Aplica as regras de compatibilidade do SIGAA às operações dos dois serviços
 * de transporte (PORTAL-001). Cada função aqui decide se um documento pode
 * ser usado para a próxima ação (preencher, clicar, enviar POST, interpretar
 * dado) ou se a operação deve falhar com um `AppErrorCode` estável.
 */

import * as cheerio from 'cheerio';
import type { AppErrorCode } from '../../shared/errors';
import { AVA, COURSE_HOME, JSF, LOGIN_SELECTOR_LABELS, STUDENT_PORTAL, courseIdInputWithValue } from './selectors';
import type { AvaForm, PortalCheck } from './portal-contracts';
import { portalError } from './portal-contracts';
import { isAuthenticatedLanding, isLoginDocument, isStudentHome, isStudentPortal } from './portal-state-classifier';

export { isLoginDocument, isStudentHome, isStudentPortal, isAuthenticatedLanding, hasRecognizedAvaForm, classify } from './portal-state-classifier';
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

export function missingViewStateBeforePostMessage(): string {
    return `SIGAA course selector drift: cannot submit the Conteúdo action without a recognized ${AVA.viewStateSelector} on the starting document.`;
}

/** Documento inicial da entrada de turma via HTTP: portal do discente esperado. */
export function validateCourseListDocument(html: string): PortalCheck {
    if (isLoginDocument(html)) {
        return portalError('SESSION_EXPIRED', 'Session expired: SIGAA returned the login page instead of the student portal.');
    }
    if (isStudentPortal(html) || isStudentHome(html)) return null;
    return portalError(
        'SELECTOR_DRIFT',
        `SIGAA portal selector drift: the student portal structure (${STUDENT_PORTAL.courseIdInput}) was not found. The portal layout may have changed.`
    );
}

export type CourseRowLookup =
    | { status: 'found'; formName: string; formAction: string; paramKey: string; paramValue: string }
    | { status: 'not_found' }
    | { status: 'malformed' };

/** Localiza a linha da turma pedida num portal já validado por `validateCourseListDocument`. */
export function findCourseRow(html: string, courseId: string): CourseRowLookup {
    const $ = cheerio.load(html);
    const idInput = $(courseIdInputWithValue(courseId));
    if (idInput.length === 0) return { status: 'not_found' };

    const form = idInput.closest('form');
    const formName = form.attr('name');
    const formAction = form.attr('action') || '/sigaa/verPortalDiscente.do';
    const link = idInput.closest('tr').find(STUDENT_PORTAL.virtualClassroomLink);
    const onclick = link.attr('onclick');
    if (!onclick || !formName) return { status: 'malformed' };

    const match = onclick.match(JSF.linkPattern);
    if (!match) return { status: 'malformed' };
    const [paramKey, paramValue] = match[2].split(',');
    if (!paramKey || !paramValue) return { status: 'malformed' };

    return { status: 'found', formName, formAction, paramKey, paramValue };
}

/** Resposta ao POST de entrada na turma: recusa o "sucesso" só por `#conteudo` genérico. */
export function validateCourseEntryEnd(html: string): PortalCheck {
    if (isLoginDocument(html)) {
        return portalError('SESSION_EXPIRED', 'Session expired: SIGAA returned the login page instead of the course.');
    }
    if (html.includes(COURSE_HOME.emptyTopicsMarker) || html.includes(COURSE_HOME.menuTurmaVirtualMarker)) {
        return null;
    }
    return portalError(
        'SELECTOR_DRIFT',
        'SIGAA course entry selector drift: the response after entering the course was not recognized as a course page.'
    );
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
