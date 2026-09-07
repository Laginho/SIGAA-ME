import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('PORTAL-001: ownership of portal assumptions', () => {
    it.each(['playwright-login.service.ts', 'http-scraper.service.ts'])(
        '%s delegates SIGAA selectors and JSF syntax to the compatibility boundary', (name) => {
            const file = resolve('electron/services', name);
            const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
            const assumptions: string[] = [];
            function visit(node: ts.Node) {
                // Inspect executable literals, not comments or import spelling.
                if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
                    ts.isTemplateHead(node) || ts.isRegularExpressionLiteral(node)) {
                    const value = node.text;
                    if (/^(?:input|form|a)\[|^form:has\(|^#nomeTurma$|^\.itemMenu|^javax\.faces\.ViewState$|^formAva$/.test(value) ||
                        (ts.isRegularExpressionLiteral(node) && value.includes('jsfcljs'))) {
                        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
                        assumptions.push(`${name}:${line}: ${value}`);
                    }
                }
                ts.forEachChild(node, visit);
            }
            visit(source);
            expect(assumptions).toEqual([]);
        }
    );
});
