/**
 * PORTAL-003 — diagnóstico estrutural de falha, privacy-safe.
 *
 * O contrato é: os campos do diagnóstico (state, urlFamily, título, contagens
 * de seletor, versão do adapter, fingerprint) nunca carregam texto livre do
 * HTML de origem. Nome de aluno, ViewState, cookie e nota de disciplina podem
 * estar no HTML de entrada — não podem sobreviver na saída.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const userDataPath = vi.hoisted(
    () => `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/sigaa-me-diagnostics-${process.pid}`,
);

vi.mock('electron', async () => {
    const fs = await import('node:fs');
    fs.mkdirSync(userDataPath, { recursive: true });
    return { app: { getPath: () => userDataPath } };
});

import {
    buildStructuralDiagnostic,
    categorizeTitle,
    domFingerprint,
    shouldCaptureRawArtifact,
    urlFamily,
    DiagnosticsService,
    type StructuralDiagnostic,
} from '../../electron/services/diagnostics.service';

const STUDENT_PORTAL_HTML = `
<html>
<head><title>Portal do Discente</title></head>
<body>
  <span class="nome_usuario">Bruno Nascimento Oliveira</span>
  <input type="hidden" name="javax.faces.ViewState" value="-7423984719283749812:secret-viewstate-token" />
  <script>document.cookie = "JSESSIONID=ABCDEF123456; path=/sigaa";</script>
  <table class="notas">
    <tr><td>Cálculo I</td><td>Média final: 9.4</td></tr>
  </table>
  <input name="idTurma" value="111" />
  <input name="idTurma" value="222" />
  <a id="turmaVirtual1">Turma virtual</a>
</body>
</html>`;

const STUDENT_PORTAL_URL = 'https://si3.ufc.br/sigaa/verPortalDiscente.do?jsessionid=ABCDEF123456';

const SENSITIVE_SUBSTRINGS = [
    'Bruno Nascimento Oliveira',
    'secret-viewstate-token',
    'JSESSIONID=ABCDEF123456',
    'Cálculo I',
    'Média final',
];

describe('buildStructuralDiagnostic', () => {
    it('deriva state, urlFamily, contagens e versão do adapter do HTML e da URL', () => {
        const diagnostic = buildStructuralDiagnostic(
            STUDENT_PORTAL_HTML,
            STUDENT_PORTAL_URL,
            'ufc-sigaa-2026.09-v1',
            { courseIdInputs: 2, virtualClassroomLinks: 1 },
        );

        expect(diagnostic.state).toBe('STUDENT_PORTAL');
        expect(diagnostic.urlFamily).toBe('/sigaa/verPortalDiscente.do');
        expect(diagnostic.adapterVersion).toBe('ufc-sigaa-2026.09-v1');
        expect(diagnostic.selectorCounts).toEqual({ courseIdInputs: 2, virtualClassroomLinks: 1 });
        expect(diagnostic.title).toBe('student-portal');
        expect(diagnostic.domFingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('título fora da allowlist vira categoria genérica — nome do aluno e nota nunca sobrevivem', () => {
        const sensitiveTitleHtml =
            '<html><head><title>Aluno Teste Privado - Calculo I - Media 9.4</title></head><body></body></html>';

        const diagnostic = buildStructuralDiagnostic(
            sensitiveTitleHtml,
            STUDENT_PORTAL_URL,
            'ufc-sigaa-2026.09-v1',
            {},
        );

        expect(diagnostic.title).toBe('other');
        const serialized = JSON.stringify(diagnostic);
        expect(serialized).not.toContain('Aluno Teste Privado');
        expect(serialized).not.toContain('Calculo I');
        expect(serialized).not.toContain('9.4');
    });

    it('família de rota remove parâmetro de caminho (;jsessionid=...), não só query string', () => {
        const diagnostic = buildStructuralDiagnostic(
            STUDENT_PORTAL_HTML,
            'https://si3.ufc.br/sigaa/paginaInicial.do;jsessionid=TEST_SESSION_SECRET?foo=1',
            'ufc-sigaa-2026.09-v1',
            {},
        );

        expect(diagnostic.urlFamily).toBe('/sigaa/paginaInicial.do');
        expect(JSON.stringify(diagnostic)).not.toContain('TEST_SESSION_SECRET');
    });

    it('nunca inclui texto pessoal, ViewState, cookie ou conteúdo acadêmico do HTML de origem', () => {
        const diagnostic = buildStructuralDiagnostic(
            STUDENT_PORTAL_HTML,
            STUDENT_PORTAL_URL,
            'ufc-sigaa-2026.09-v1',
            { courseIdInputs: 2, virtualClassroomLinks: 1 },
        );

        const serialized = JSON.stringify(diagnostic);
        for (const sensitive of SENSITIVE_SUBSTRINGS) {
            expect(serialized).not.toContain(sensitive);
        }
    });

    it('a URL family descarta query string — sessão/ids nunca aparecem no diagnóstico', () => {
        const diagnostic = buildStructuralDiagnostic(
            STUDENT_PORTAL_HTML,
            'https://si3.ufc.br/sigaa/ava/index.jsf?idTurma=999&jsessionid=SECRET',
            'ufc-sigaa-2026.09-v1',
            {},
        );

        expect(diagnostic.urlFamily).toBe('/sigaa/ava/index.jsf');
        expect(JSON.stringify(diagnostic)).not.toContain('SECRET');
    });
});

describe('domFingerprint', () => {
    it('é igual para HTML com a mesma estrutura de tags e texto diferente', () => {
        const a = '<html><body><div><p>Aluno A</p></div></body></html>';
        const b = '<html><body><div><p>Aluno completamente diferente, B</p></div></body></html>';

        expect(domFingerprint(a)).toBe(domFingerprint(b));
    });

    it('muda quando a estrutura de tags muda', () => {
        const a = '<html><body><div><p>x</p></div></body></html>';
        const b = '<html><body><section><p>x</p></section></body></html>';

        expect(domFingerprint(a)).not.toBe(domFingerprint(b));
    });
});

describe('urlFamily', () => {
    it('descarta query string e fragmento', () => {
        expect(urlFamily('https://si3.ufc.br/sigaa/ava/index.jsf?idTurma=999&jsessionid=SECRET')).toBe(
            '/sigaa/ava/index.jsf',
        );
    });

    it('remove parâmetro de caminho (;jsessionid=...) — o segredo mora no pathname, não na query', () => {
        expect(
            urlFamily('https://si3.ufc.br/sigaa/paginaInicial.do;jsessionid=TEST_SESSION_SECRET?foo=1'),
        ).toBe('/sigaa/paginaInicial.do');
    });

    it('URL inválida devolve string vazia', () => {
        expect(urlFamily('not a url')).toBe('');
    });
});

describe('categorizeTitle', () => {
    // Os sete títulos reais do SIGAA — `grep -rhoi "<title>[^<]*</title>" tests/fixtures/`.
    const KNOWN_TITLES: ReadonlyArray<readonly [string, string]> = [
        ['AVA - SIGAA - Sistema Integrado de Gestão de Atividades Acadêmicas', 'ava'],
        ['SIGAA - Acesso Negado', 'access-denied'],
        ['SIGAA - Login', 'login'],
        ['SIGAA - Manutenção', 'maintenance'],
        ['SIGAA - Portal do Discente', 'student-portal'],
        ['SIGAA - Portal', 'portal'],
        ['SIGAA - Turma', 'course-class'],
    ];

    it.each(KNOWN_TITLES)('categoriza "%s" como %s', (title, expected) => {
        expect(categorizeTitle(title)).toBe(expected);
    });

    it('título fora da allowlist vira "other", nunca o texto', () => {
        expect(categorizeTitle('Aluno Teste Privado - Calculo I - Media 9.4')).toBe('other');
    });
});

describe('shouldCaptureRawArtifact', () => {
    it('em desenvolvimento, captura mesmo sem consentimento', () => {
        expect(shouldCaptureRawArtifact(false, false)).toBe(true);
    });

    it('em produção sem consentimento, não captura', () => {
        expect(shouldCaptureRawArtifact(true, false)).toBe(false);
    });

    it('em produção com consentimento explícito, captura', () => {
        expect(shouldCaptureRawArtifact(true, true)).toBe(true);
    });
});

describe('DiagnosticsService', () => {
    beforeEach(() => {
        fs.mkdirSync(userDataPath, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(userDataPath, { recursive: true, force: true });
    });

    function diagnosticAt(timestamp: number): StructuralDiagnostic {
        return {
            timestamp,
            state: 'UNKNOWN',
            urlFamily: '/sigaa/paginaInicial.do',
            title: 'SIGAA',
            selectorCounts: {},
            adapterVersion: 'ufc-sigaa-2026.09-v1',
            domFingerprint: 'x'.repeat(64),
        };
    }

    it('retenção é limitada: gravar além do limite descarta os diagnósticos mais antigos', () => {
        const service = new DiagnosticsService();
        for (let timestamp = 1; timestamp <= 25; timestamp++) {
            service.record(diagnosticAt(timestamp));
        }

        const dir = path.join(userDataPath, 'diagnostics');
        const remaining = fs
            .readdirSync(dir)
            .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as StructuralDiagnostic)
            .map((d) => d.timestamp)
            .sort((a, b) => a - b);

        expect(remaining).toHaveLength(20);
        expect(remaining[0]).toBe(6);
        expect(remaining[remaining.length - 1]).toBe(25);
    });

    it('clear remove todos os diagnósticos gravados', () => {
        const service = new DiagnosticsService();
        service.record(diagnosticAt(1));
        service.record(diagnosticAt(2));

        service.clear();

        const dir = path.join(userDataPath, 'diagnostics');
        expect(fs.existsSync(dir) && fs.readdirSync(dir).length > 0).toBe(false);
    });

    it('grava normalmente depois de um clear anterior', () => {
        const service = new DiagnosticsService();
        service.record(diagnosticAt(1));
        service.clear();

        expect(() => service.record(diagnosticAt(2))).not.toThrow();

        const dir = path.join(userDataPath, 'diagnostics');
        expect(fs.readdirSync(dir)).toHaveLength(1);
    });
});
