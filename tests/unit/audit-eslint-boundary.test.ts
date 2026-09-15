/**
 * Rede de regressão sobre o ESLint de produção (QA-001) — prova que a zona de
 * fronteira (`shared/`, `electron/ipc/`, `electron/preload.ts`) continua
 * proibindo `any`/`as any` como erro, que o resto do código continua só
 * avisando, e que `tests/` continua liberado. Chama o ESLint real com
 * `lintText`, sem fixture em disco e sem cópia da config — se
 * `eslint.config.js` mudar de forma incompatível, este teste é quem denuncia.
 */

import path from 'path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CODE = 'const a: any = 1; export const b = (a as any).c;';

// Uma instância para os cinco casos: cada `new ESLint()` recarrega
// `eslint.config.js` e o typescript-eslint inteiro. Com cinco, a primeira
// execução em disco frio passou de 50s e estourou o `testTimeout` de 30s.
const eslint = new ESLint({ cwd: ROOT });

async function lint(relativePath: string) {
    const [result] = await eslint.lintText(CODE, { filePath: path.join(ROOT, relativePath) });
    return result.messages;
}

describe('eslint boundary enforcement (QA-001)', () => {
    it.each(['shared/x.ts', 'electron/ipc/x.ts', 'electron/preload.ts'])(
        'erra any e as any na zona de fronteira: %s',
        async (relativePath) => {
            const messages = await lint(relativePath);

            expect(
                messages.some(
                    (m) => m.ruleId === '@typescript-eslint/no-explicit-any' && m.severity === 2,
                ),
            ).toBe(true);
            expect(
                messages.some(
                    (m) => m.ruleId === 'no-restricted-syntax' && m.severity === 2 && m.message.includes('as any'),
                ),
            ).toBe(true);
        },
    );

    it('avisa any fora da fronteira, sem erro: src/pages/x.ts', async () => {
        const messages = await lint('src/pages/x.ts');
        const anyMessages = messages.filter((m) => m.ruleId === '@typescript-eslint/no-explicit-any');

        expect(anyMessages.length).toBeGreaterThan(0);
        expect(anyMessages.every((m) => m.severity === 1)).toBe(true);
        expect(messages.every((m) => m.severity !== 2)).toBe(true);
    });

    it('desliga no-explicit-any em teste: tests/unit/x.test.ts', async () => {
        const messages = await lint('tests/unit/x.test.ts');
        expect(messages.some((m) => m.ruleId === '@typescript-eslint/no-explicit-any')).toBe(false);
    });
});
