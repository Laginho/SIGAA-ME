import { describe, expect, it } from 'vitest';
import { cookieDomainMatches } from '../../electron/services/http-scraper.service';

/**
 * CLEAN-008 item 22: `endsWith` sem âncora de rótulo aceitava um host cujo
 * nome apenas termina com o domínio do cookie — `notsi3.ufc.br` casava
 * `si3.ufc.br`. Inócuo com URL fixa, quebra no dia em que a URL virar
 * configurável.
 */
describe('cookieDomainMatches', () => {
    it('rejeita um host que apenas termina com o domínio do cookie, sem rótulo próprio', () => {
        expect(cookieDomainMatches('notsi3.ufc.br', 'si3.ufc.br')).toBe(false);
    });

    it('aceita o host exatamente igual ao domínio do cookie', () => {
        expect(cookieDomainMatches('si3.ufc.br', 'si3.ufc.br')).toBe(true);
    });

    it('aceita um subdomínio real, separado por ponto', () => {
        expect(cookieDomainMatches('sub.si3.ufc.br', 'si3.ufc.br')).toBe(true);
    });
});
