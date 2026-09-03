/**
 * `shared/errors.ts` (ARCH-001): o resultado discriminado que atravessa o IPC
 * e a tabela que traduz mensagem de scraper em código.
 *
 * O que importa aqui é a **distinção** que os consumidores fazem: relogar
 * ajuda em SESSION_EXPIRED e não ajuda em SELECTOR_DRIFT; INVALID_REQUEST não
 * se repete. A tabela de regex é heurística (ver `ponytail:` no fonte) — cada
 * mensagem real que os serviços emitem hoje tem um caso aqui, para que uma
 * mudança de texto lá quebre este teste em vez de virar UNKNOWN em silêncio.
 */
import { describe, expect, it } from 'vitest';
import { classifyMessage, fail, failFromMessage, isRetryable, ok } from '../../shared/errors';

describe('AppResult', () => {
    it('ok() sem argumento serve para AppResult<void>', () => {
        expect(ok()).toEqual({ success: true, data: undefined });
        expect(ok({ filePath: 'x' })).toEqual({ success: true, data: { filePath: 'x' } });
    });

    it('fail() carrega código e mensagem', () => {
        expect(fail('CANCELLED', 'cancelado')).toEqual({ success: false, error: { code: 'CANCELLED', message: 'cancelado' } });
    });

    it('failFromMessage usa o fallback quando a origem não deu mensagem', () => {
        expect(failFromMessage(undefined, 'Falha X')).toEqual({ success: false, error: { code: 'UNKNOWN', message: 'Falha X' } });
    });
});

describe('classifyMessage — mensagens reais dos serviços', () => {
    const cases: [string, ReturnType<typeof classifyMessage>][] = [
        ['SIGAA portal selector drift: the course list is missing input[name="idTurma"].', 'SELECTOR_DRIFT'],
        ['SIGAA login selector drift: the username field was not found.', 'SELECTOR_DRIFT'],
        ['SIGAA course selector drift: required JSF structure is missing (form).', 'SELECTOR_DRIFT'],
        ['Session expired: SIGAA returned the login page instead of course content.', 'SESSION_EXPIRED'],
        ['No stored session - please login first', 'SESSION_EXPIRED'],
        ['No session cookies. Please login first.', 'SESSION_EXPIRED'],
        ['Course session data not found. Please refresh the course list.', 'SESSION_EXPIRED'],
        ['No stored credentials available', 'SESSION_EXPIRED'],
        ['SIGAA login navigation timed out. Check portal availability.', 'PORTAL_UNAVAILABLE'],
        ['timeout of 10000ms exceeded', 'PORTAL_UNAVAILABLE'],
        ['read ECONNRESET', 'PORTAL_UNAVAILABLE'],
        ['Course ID input not found in portal (Title: Portal)', 'NOT_FOUND'],
        ['Target page, context or browser has been closed', 'SESSION_EXPIRED'],
        ['Browser not active', 'SESSION_EXPIRED'],
        ['Could not parse news content from page', 'UNKNOWN'],
        ['Invalid download script format', 'UNKNOWN'],
    ];

    it.each(cases)('%s → %s', (message, code) => {
        expect(classifyMessage(message)).toBe(code);
    });
});

describe('isRetryable', () => {
    it('relogar/esperar ajuda em sessão e portal, não em deriva nem pedido inválido', () => {
        expect(isRetryable({ code: 'SESSION_EXPIRED', message: '' })).toBe(true);
        expect(isRetryable({ code: 'PORTAL_UNAVAILABLE', message: '' })).toBe(true);
        expect(isRetryable({ code: 'SELECTOR_DRIFT', message: '' })).toBe(false);
        expect(isRetryable({ code: 'INVALID_REQUEST', message: '' })).toBe(false);
        expect(isRetryable({ code: 'NOT_FOUND', message: '' })).toBe(false);
    });
});
