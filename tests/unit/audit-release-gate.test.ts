/**
 * Rede de regressão sobre os workflows (QA-001) — prova que publicar continua
 * atrás do gate, e que os dois gates novos (`coverage`, `audit:prod`) são
 * executados pelo CI em vez de só existirem no `package.json`. Lê o workflow
 * como texto e compara índice de linha; sem parser YAML novo (`js-yaml` é
 * transitivo, não entra como dependência só para isto).
 */

import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

function workflowLines(name: string): string[] {
    return readFileSync(path.resolve(process.cwd(), '.github/workflows', name), 'utf8').split('\n');
}

const lines = workflowLines('release.yml');

function lineIndexOf(needle: string): number {
    return lines.findIndex((line) => line.trim() === needle);
}

describe('release workflow gates publishing behind quality checks (QA-001)', () => {
    // `npm test` saiu da lista junto com a linha que ela vigiava: o critério 6
    // manda trocar por `npm run coverage`, que roda a mesma suíte com os
    // thresholds por cima.
    const gateCommands = [
        'run: npm run typecheck',
        'run: npm run lint',
        'run: npm run coverage',
        'run: npm run audit:prod',
    ];

    it('runs every gate inside the build job, before the release build', () => {
        const buildJobIndex = lines.findIndex((line) => /^\s{2}build:/.test(line));
        expect(buildJobIndex).toBeGreaterThan(-1);

        const releaseIndex = lineIndexOf('run: npm run release');
        expect(releaseIndex).toBeGreaterThan(buildJobIndex);

        for (const command of gateCommands) {
            const gateIndex = lineIndexOf(command);
            expect(gateIndex, command).toBeGreaterThan(buildJobIndex);
            expect(gateIndex, command).toBeLessThan(releaseIndex);
        }
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

        // Estar dentro do job não basta: o passo de publicar tem de vir depois
        // de todo gate. Sem isto, mover o step `Publish` para cima do primeiro
        // gate deixa esta suíte verde e publica sem checagem nenhuma.
        const lastGateIndex = Math.max(...gateCommands.map(lineIndexOf));

        for (const index of publishLineIndexes) {
            expect(index).toBeGreaterThan(buildJobIndex);
            expect(index).toBeLessThan(buildJobEnd);
            expect(index).toBeGreaterThan(lastGateIndex);
        }
    });
});

describe('release workflow publishes checksums and provenance (REL-001)', () => {
    const publishRunIndex = lineIndexOf('run: npx electron-builder --win --publish always');
    const checksumRunIndex = lines.findIndex((line) => line.trim().startsWith('run: cd "release/') && line.includes('sha256sum'));
    const attestIndex = lines.findIndex((line) =>
        line.trim().startsWith('uses: actions/attest-build-provenance@'),
    );

    it('generates SHA256SUMS.txt for the installers after Publish, unconditionally', () => {
        expect(publishRunIndex).toBeGreaterThan(-1);
        expect(checksumRunIndex).toBeGreaterThan(publishRunIndex);
    });

    it('attests build provenance for the installers after Publish', () => {
        expect(attestIndex).toBeGreaterThan(publishRunIndex);
    });

    it('grants the build job the permissions attest-build-provenance needs', () => {
        const permissionsIndex = lines.findIndex((line) => line.trim() === 'permissions:');
        expect(permissionsIndex).toBeGreaterThan(-1);

        const stepsIndex = lines.findIndex((line, i) => i > permissionsIndex && /^\s{4}steps:/.test(line));
        expect(stepsIndex).toBeGreaterThan(-1);

        for (const permission of ['contents: write', 'id-token: write', 'attestations: write']) {
            const permissionIndex = lines.findIndex(
                (line, i) => i > permissionsIndex && i < stepsIndex && line.trim().startsWith(permission),
            );
            expect(permissionIndex, permission).toBeGreaterThan(-1);
        }
    });

    it('uploads SHA256SUMS.txt to the draft release, gated on publish, after checksums and attestation', () => {
        const uploadIndex = lines.findIndex((line) => line.trim().includes('gh release upload'));
        expect(uploadIndex).toBeGreaterThan(-1);
        expect(uploadIndex).toBeGreaterThan(checksumRunIndex);
        expect(uploadIndex).toBeGreaterThan(attestIndex);

        // "sem condição" para os outros dois; este é o único que fica atrás de
        // um `if`, porque só faz sentido depois que a release existe.
        expect(lines[uploadIndex - 1]?.trim()).toBe('if: ${{ inputs.publish }}');
    });

    it('includes SHA256SUMS.txt in the uploaded artifact alongside the installers', () => {
        const artifactNameIndex = lineIndexOf('name: windows-installer');
        expect(artifactNameIndex).toBeGreaterThan(-1);

        const pathBlock = lines.slice(artifactNameIndex, artifactNameIndex + 6).join('\n');
        expect(pathBlock).toContain('SHA256SUMS.txt');
    });
});

describe('quality workflow runs the coverage and audit gates on every PR (QA-001)', () => {
    const qualityLines = workflowLines('quality.yml');

    it.each(['run: npm run coverage', 'run: npm run audit:prod'])(
        'roda %s dentro do job `gate`',
        (command) => {
            const gateJobIndex = qualityLines.findIndex((line) => /^\s{2}gate:/.test(line));
            expect(gateJobIndex).toBeGreaterThan(-1);

            // O job seguinte marca o fim do `gate`: um passo colado no `e2e`
            // não roda o mesmo conjunto de checagens.
            const nextJobIndex = qualityLines.findIndex(
                (line, i) => i > gateJobIndex && /^\s{2}\S+:/.test(line),
            );
            const gateJobEnd = nextJobIndex === -1 ? qualityLines.length : nextJobIndex;

            const commandIndex = qualityLines.findIndex((line) => line.trim() === command);
            expect(commandIndex).toBeGreaterThan(gateJobIndex);
            expect(commandIndex).toBeLessThan(gateJobEnd);
        },
    );
});

describe('lint script ratchets eslint warnings, never grows (PIPE-007)', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
    };

    it('caps the lint script with --max-warnings', () => {
        expect(pkg.scripts.lint).toMatch(/--max-warnings \d+/);
    });
});

describe('quality workflow scopes the GITHUB_TOKEN permissions (PIPE-007)', () => {
    const qualityLines = workflowLines('quality.yml');

    it('declares permissions before the first job', () => {
        const permissionsIndex = qualityLines.findIndex((line) => line.trim() === 'permissions:');
        const jobsIndex = qualityLines.findIndex((line) => line.trim() === 'jobs:');

        expect(permissionsIndex).toBeGreaterThan(-1);
        expect(jobsIndex).toBeGreaterThan(-1);
        expect(permissionsIndex).toBeLessThan(jobsIndex);
    });
});

describe('gitleaks action is pinned by commit SHA (PIPE-007)', () => {
    const qualityLines = workflowLines('quality.yml');

    it('pins gitleaks/gitleaks-action to a full 40-char commit SHA', () => {
        const usesLine = qualityLines.find((line) => line.includes('gitleaks/gitleaks-action@'));

        expect(usesLine).toBeDefined();
        expect(usesLine).toMatch(/gitleaks\/gitleaks-action@[0-9a-f]{40}/);
    });
});
