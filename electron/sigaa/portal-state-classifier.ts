/**
 * Classifica um documento do SIGAA sem navegar (PORTAL-001): só recebe o HTML
 * (e opcionalmente a URL) e devolve o estado. Nenhuma chamada a Playwright ou
 * rede aqui — quem navega são os dois serviços de transporte.
 */

import * as cheerio from 'cheerio';
import { AVA, LOGIN, STUDENT_HOME, STUDENT_PORTAL } from './selectors';
import type { PortalState } from './portal-contracts';

/**
 * Único sinal de LOGIN: o campo de usuário reconhecido pela produção.
 * Nunca a ocorrência de `verTelaLogin.do`/`logar.do` em link, texto ou URL —
 * um "Sair" numa página de turma válida não pode virar sessão expirada.
 */
export function isLoginDocument(html: string): boolean {
    const $ = cheerio.load(html);
    return $(LOGIN.username).length > 0;
}

/** STUDENT_HOME: landing pós-login, antes de entrar no portal com a lista de turmas. */
export function isStudentHome(html: string): boolean {
    const $ = cheerio.load(html);
    if ($(STUDENT_HOME.menuDiscenteLink).length > 0) return true;
    return $.text().includes(STUDENT_HOME.portalDiscenteText);
}

/** STUDENT_PORTAL: portal com a lista de turmas (ou os landmarks que a compõem). */
export function isStudentPortal(html: string): boolean {
    const $ = cheerio.load(html);
    if ($(STUDENT_PORTAL.courseIdInput).length > 0 && $(STUDENT_PORTAL.virtualClassroomLink).length > 0) return true;
    return $(STUDENT_PORTAL.userName).length > 0;
}

/** Pouso autenticado válido depois de login ou navegação — home OU portal. */
export function isAuthenticatedLanding(html: string): boolean {
    return isStudentHome(html) || isStudentPortal(html);
}

/**
 * Formulário AVA reconhecido, com ViewState não vazio. Sem fallback para o
 * primeiro formulário da página — um form alheio com ViewState não conta.
 */
export function hasRecognizedAvaForm(html: string): boolean {
    const $ = cheerio.load(html);
    const form = $(AVA.formSelector);
    if (form.length === 0) return false;
    const viewState = form.find(AVA.viewStateSelector).val();
    return typeof viewState === 'string' && viewState.length > 0;
}

export function classify(html: string, url = ''): PortalState {
    if (isLoginDocument(html)) return 'LOGIN';
    if (isStudentPortal(html)) return 'STUDENT_PORTAL';
    if (isStudentHome(html)) return 'STUDENT_HOME';
    if (hasRecognizedAvaForm(html)) return url.includes('/ava/') ? 'FILES_SECTION' : 'COURSE_HOME';
    return 'UNKNOWN';
}
