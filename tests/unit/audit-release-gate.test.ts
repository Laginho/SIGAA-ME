/**
 * Rede de regressão sobre `.github/workflows/release.yml` (QA-001) — prova
 * que publicar continua atrás do gate. Lê o workflow como texto e compara
 * índice de linha; sem parser YAML novo (`js-yaml` é transitivo, não entra
 * como dependência só para isto).
 */

import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const workflowPath = path.resolve(process.cwd(), '.github/workflows/release.yml');
const lines = readFileSync(workflowPath, 'utf8').split('\n');

function lineIndexOf(needle: string): number {
    return lines.findIndex((line) => line.trim() === needle);
}

describe('release workflow gates publishing behind quality checks (QA-001)', () => {
    it('runs typecheck, lint and tests inside the build job, before the release build', () => {
        const buildJobIndex = lines.findIndex((line) => /^\s{2}build:/.test(line));
        expect(buildJobIndex).toBeGreaterThan(-1);

        const typecheckIndex = lineIndexOf('run: npm run typecheck');
        const lintIndex = lineIndexOf('run: npm run lint');
        const testIndex = lineIndexOf('run: npm test');
        const releaseIndex = lineIndexOf('run: npm run release');

        for (const gateIndex of [typecheckIndex, lintIndex, testIndex, releaseIndex]) {
            expect(gateIndex).toBeGreaterThan(buildJobIndex);
        }

        expect(typecheckIndex).toBeLessThan(releaseIndex);
        expect(lintIndex).toBeLessThan(releaseIndex);
        expect(testIndex).toBeLessThan(releaseIndex);
    });

    it('keeps --publish always scoped to the build job', () => {
        const buildJobIndex = lines.findIndex((line) => /^\s{2}build:/.test(line));
        const nextJobIndex = lines.findIndex((line, i) => i > buildJobIndex && /^\s{2}\S+:/.test(line));
        const buildJobEnd = nextJobIndex === -1 ? lines.length : nextJobIndex;

        const publishLineIndexes = lines
            .map((line, index) => ({ line: line.trim(), index }))
            .filter(({ line }) => line.startsWith('run:') && line.includes('--publish always'))
            .map(({ index }) => index);

        expect(publishLineIndexes.length).toBeGreaterThan(0);
        for (const index of publishLineIndexes) {
            expect(index).toBeGreaterThan(buildJobIndex);
            expect(index).toBeLessThan(buildJobEnd);
        }
    });
});
