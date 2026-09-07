/**
 * Estados, transições e erro interno do adapter de compatibilidade SIGAA
 * (PORTAL-001). Sem dependência de Electron, Playwright ou axios — só tipos e
 * funções puras, como `shared/errors.ts`.
 */

import type { AppErrorCode } from '../../shared/errors';

/** Versão do contrato interno; sobe quando um landmark ou regra de reconhecimento muda. */
export const PORTAL_ADAPTER_VERSION = 'ufc-sigaa-2026.09-v1';

export type PortalState =
    | 'LOGIN'
    | 'STUDENT_HOME'
    | 'STUDENT_PORTAL'
    | 'COURSE_HOME'
    | 'FILES_SECTION'
    | 'NEWS_DETAIL'
    | 'ACCESS_DENIED'
    | 'UNKNOWN';

export interface PortalError {
    code: AppErrorCode;
    message: string;
}

export function portalError(code: AppErrorCode, message: string): PortalError {
    return { code, message };
}

/** Forma comum devolvida pelas checagens do adapter: `null` quando o documento é aceito. */
export type PortalCheck = PortalError | null;

export interface AvaForm {
    viewState: string;
    action: string;
    formName: string;
    inputs: Record<string, string>;
}
