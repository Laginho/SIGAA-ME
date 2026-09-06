/**
 * DATA-001 — identidade de conta no main.
 *
 * Vermelho hoje pelo motivo certo: `electron/services/account-context.service.ts`
 * não existe (a falha de import é o vermelho legítimo). Quando existir, a
 * parte 2 continua vermelha até `SigaaService.login` derivar o id e invalidar
 * o catálogo de sessão do scraper HTTP na troca de conta.
 *
 * 1. `deriveAccountId(username)`: função pura, `node:crypto`, sem Electron.
 *    Mesmo id para o mesmo usuário em qualquer caixa/espaço; um sentido só;
 *    nunca contém o username.
 * 2. `SigaaService.login`: o `AccountProfile.id` devolvido é esse hash (o
 *    username cru não atravessa o IPC), a conta ativa do processo main passa
 *    a ser ele, e uma conta diferente da anterior zera cookies e ViewStates
 *    do `HttpScraperService` (`resetSession`). Nenhum log recebe o username.
 *
 * Contrato e decisões: `.scratch/04-fase3-fronteiras-de-confianca/issues/05-DATA-001-*.md`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// QA-006: o serviço faz mkdir de verdade antes de baixar; nada aqui olha o disco.
vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
}));

const fakes = vi.hoisted(() => ({
    resetSession: vi.fn(),
    setCookies: vi.fn(),
    close: vi.fn(async () => undefined),
    loginResult: { success: true, cookies: [{ name: 'JSESSIONID', value: 'abc' }], userName: 'FULANO DE TAL' } as Record<string, unknown>,
}));

vi.mock('../../electron/services/playwright-login.service', () => ({
    PlaywrightLoginService: class {
        login = vi.fn(async () => fakes.loginResult);
        close = fakes.close;
        getCookies = vi.fn(() => []);
        getUserAgent = vi.fn(async () => 'ua');
    },
}));

vi.mock('../../electron/services/http-scraper.service', () => ({
    HttpScraperService: class {
        setCookies = fakes.setCookies;
        setUserAgent = vi.fn();
        resetSession = fakes.resetSession;
    },
}));

const loggerMock = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../electron/services/logger.service', () => ({ logger: loggerMock }));

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => 'sigaa-me-account-context-tests'), isPackaged: false },
}));

import {
    deriveAccountId,
    getActiveAccount,
    setActiveAccount,
} from '../../electron/services/account-context.service';
import { SigaaService } from '../../electron/services/sigaa.service';

const HEX_64 = /^[0-9a-f]{64}$/;

describe('deriveAccountId', () => {
    it('is deterministic and ignores case and surrounding whitespace', () => {
        expect(deriveAccountId('  Aluno01 ')).toBe(deriveAccountId('aluno01'));
        expect(deriveAccountId('aluno01')).toBe(deriveAccountId('aluno01'));
    });

    it('differs for different usernames', () => {
        expect(deriveAccountId('aluno01')).not.toBe(deriveAccountId('aluno02'));
    });

    it('is a lowercase sha-256 hex digest that never contains the username', () => {
        const id = deriveAccountId('aluno01');
        expect(id).toMatch(HEX_64);
        expect(id).not.toContain('aluno01');
    });

    it('rejects an empty or whitespace-only username instead of hashing nothing', () => {
        expect(() => deriveAccountId('')).toThrow();
        expect(() => deriveAccountId('   ')).toThrow();
    });
});

describe('active account (main process)', () => {
    beforeEach(() => setActiveAccount(null));

    it('starts null and reflects the last value set', () => {
        expect(getActiveAccount()).toBeNull();
        setActiveAccount('a'.repeat(64));
        expect(getActiveAccount()).toBe('a'.repeat(64));
        setActiveAccount(null);
        expect(getActiveAccount()).toBeNull();
    });
});

describe('SigaaService.login binds the session to an account id', () => {
    beforeEach(() => {
        setActiveAccount(null);
        vi.clearAllMocks();
        fakes.loginResult = { success: true, cookies: [{ name: 'JSESSIONID', value: 'abc' }], userName: 'FULANO DE TAL' };
    });

    it('returns the derived id instead of the raw username and makes it the active account', async () => {
        const service = new SigaaService();

        const result = await service.login('  Aluno01 ', 'senha');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.id).toBe(deriveAccountId('aluno01'));
        expect(result.data.id).toMatch(HEX_64);
        expect(result.data.name).toBe('FULANO DE TAL');
        expect(getActiveAccount()).toBe(result.data.id);
    });

    it('resets the HTTP scraper session (cookies + ViewStates) when a different account logs in', async () => {
        const service = new SigaaService();

        await service.login('aluno01', 'x');
        expect(fakes.resetSession).not.toHaveBeenCalled();

        await service.login('aluno02', 'y');
        expect(fakes.resetSession).toHaveBeenCalledTimes(1);
        expect(getActiveAccount()).toBe(deriveAccountId('aluno02'));
    });

    it('does not reset the session when the same account logs in again', async () => {
        const service = new SigaaService();

        await service.login('aluno01', 'x');
        await service.login('ALUNO01', 'x');

        expect(fakes.resetSession).not.toHaveBeenCalled();
    });

    it('leaves the active account untouched when the login fails', async () => {
        const service = new SigaaService();
        await service.login('aluno01', 'x');
        fakes.loginResult = { success: false, error: 'Invalid credentials' };

        const result = await service.login('aluno02', 'y');

        expect(result.success).toBe(false);
        expect(getActiveAccount()).toBe(deriveAccountId('aluno01'));
        expect(fakes.resetSession).not.toHaveBeenCalled();
    });

    it('logout clears the active account and the scraper session', async () => {
        const service = new SigaaService();
        await service.login('aluno01', 'x');

        await service.logout();

        expect(getActiveAccount()).toBeNull();
        expect(fakes.resetSession).toHaveBeenCalledTimes(1);
        expect(fakes.close).toHaveBeenCalledTimes(1);
    });

    it('never writes the username or the hash input to any log', async () => {
        const consoleSpies = [
            vi.spyOn(console, 'log').mockImplementation(() => undefined),
            vi.spyOn(console, 'warn').mockImplementation(() => undefined),
            vi.spyOn(console, 'error').mockImplementation(() => undefined),
        ];
        const service = new SigaaService();

        await service.login('MatriculaSecreta42', 'x');
        fakes.loginResult = { success: false, error: 'Invalid credentials' };
        await service.login('MatriculaSecreta42', 'x');

        const logged = [
            ...loggerMock.info.mock.calls,
            ...loggerMock.warn.mock.calls,
            ...loggerMock.error.mock.calls,
            ...consoleSpies.flatMap(spy => spy.mock.calls),
        ].flat().map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg)));

        expect(logged.some(entry => /matriculasecreta42/i.test(entry))).toBe(false);
        consoleSpies.forEach(spy => spy.mockRestore());
    });
});
