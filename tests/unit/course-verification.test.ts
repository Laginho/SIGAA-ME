/**
 * Regressão: conteúdo de uma disciplina atribuído a outra (Estatística → Sinais).
 *
 * Toda página de turma virtual embute um painel oculto "Escolha uma Turma" com
 * os nomes de TODAS as disciplinas do aluno. A verificação antiga procurava o
 * nome esperado na página inteira, então passava mesmo quando a sessão JSF
 * servia a turma errada (clique de curso falhava em silêncio e o goto forçado
 * para ava/index.jsf renderizava a turma anterior). A verificação corrigida é
 * escopada ao cabeçalho `#nomeTurma`, o único elemento que identifica a turma
 * realmente carregada.
 *
 * Se a verificação voltar a olhar a página inteira, o caso "página errada"
 * abaixo deixa de ser representável e este teste morre junto — é o sinal.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
    app: { isPackaged: true, getPath: vi.fn(() => '/tmp/sigaa-me-test') }
}));
vi.mock('../../electron/services/logger.service', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { isExpectedCoursePage } from '../../electron/services/playwright-login.service';

describe('isExpectedCoursePage', () => {
    it('rejeita quando o cabeçalho mostra outra disciplina (o cenário do bug)', () => {
        // A página inteira de Estatística CONTÉM "SINAIS E SISTEMAS" (no painel
        // "Escolha uma Turma"), mas o cabeçalho não — e é só ele que conta.
        const header = 'TI0111 - ESTATÍSTICA PARA ENGENHARIA (2026.1 - T01)';
        expect(isExpectedCoursePage(header, 'SINAIS E SISTEMAS')).toBe(false);
    });

    it('aceita o cabeçalho da turma correta, com código e período em volta', () => {
        const header = '\n\t\tTI0116 - SINAIS E SISTEMAS\n\t\t(2026.1 - T01)\n';
        expect(isExpectedCoursePage(header, 'SINAIS E SISTEMAS')).toBe(true);
    });

    it('compara sem diferenciar caixa e pontuação', () => {
        const header = 'TI0172 - PROJETO INTEGRADOR II: CIRCUITOS ELETRÔNICOS E SINAIS (2026.1 - T03)';
        expect(isExpectedCoursePage(header, 'PROJETO INTEGRADOR II: CIRCUITOS ELETRÔNICOS E SINAIS')).toBe(true);
    });

    it('distingue "Curso I" de "Curso II"', () => {
        const header = 'TI0169 - PROJETO INTEGRADOR I: CIRCUITOS ELÉTRICOS E DIGITAIS (2026.1 - T03)';
        expect(isExpectedCoursePage(header, 'PROJETO INTEGRADOR II: CIRCUITOS ELETRÔNICOS E SINAIS')).toBe(false);
    });

    it('rejeita cabeçalho vazio (drift de seletor: #nomeTurma sumiu)', () => {
        expect(isExpectedCoursePage('', 'SINAIS E SISTEMAS')).toBe(false);
    });
});
