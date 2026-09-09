/**
 * Diagnóstico estrutural de falha (PORTAL-003) — privacy-safe por construção:
 * a saída só carrega enum de estado, família de rota (pathname sem parâmetro
 * de sessão), categoria de título (nunca o texto), contagens e um hash de
 * esqueleto de tags. Texto livre de HTML (nome, ViewState, cookie, nota,
 * título específico do aluno) nunca atravessa para o diagnóstico gravado.
 */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import { app } from 'electron';
import { classify } from '../sigaa/portal-state-classifier';
import type { PortalState } from '../sigaa/portal-contracts';

export interface StructuralDiagnostic {
    timestamp: number;
    state: PortalState;
    urlFamily: string;
    title: string;
    selectorCounts: Record<string, number>;
    adapterVersion: string;
    domFingerprint: string;
}

const MAX_RETAINED = 20;

/**
 * Só o pathname, e sem parâmetro de caminho — query string, fragmento e o
 * `;jsessionid=...` que o SIGAA anexa ao próprio segmento de path (não à
 * query) são onde sessão/id costumam morar.
 */
export function urlFamily(url: string): string {
    try {
        const { pathname } = new URL(url);
        return pathname
            .split('/')
            .map((segment) => segment.split(';')[0])
            .join('/');
    } catch {
        return '';
    }
}

/**
 * Allowlist dos títulos reais do SIGAA (`grep -rhoi "<title>[^<]*</title>"
 * tests/fixtures/`), cada um mapeado para uma categoria estável. Título fora
 * da allowlist vira `'other'` — nunca o texto original, que pode carregar
 * nome de aluno ou nota (ex.: "Aluno Teste Privado - Calculo I - Media 9.4").
 */
const TITLE_CATEGORIES: ReadonlyArray<readonly [RegExp, string]> = [
    [/acesso\s*negado/i, 'access-denied'],
    [/manuten/i, 'maintenance'],
    [/login/i, 'login'],
    [/portal\s+do\s+discente/i, 'student-portal'],
    [/turma/i, 'course-class'],
    [/^ava\b/i, 'ava'],
    [/portal/i, 'portal'],
];

export function categorizeTitle(title: string): string {
    const match = TITLE_CATEGORIES.find(([pattern]) => pattern.test(title));
    return match ? match[1] : 'other';
}

/** Nomes de tag em ordem de documento, sem texto nem atributo: muda só quando a estrutura muda. */
export function domFingerprint(html: string): string {
    const $ = cheerio.load(html);
    const tags: string[] = [];
    $('*').each((_, el) => {
        if (el.type === 'tag') tags.push(el.name);
    });
    return createHash('sha256').update(tags.join('.')).digest('hex');
}

/** Dev sempre pode capturar HTML/screenshot/trace cru; produção só com consentimento explícito. */
export function shouldCaptureRawArtifact(isPackaged: boolean, consent: boolean): boolean {
    return !isPackaged || consent;
}

export function buildStructuralDiagnostic(
    html: string,
    url: string,
    adapterVersion: string,
    selectorCounts: Record<string, number>,
): StructuralDiagnostic {
    const $ = cheerio.load(html);
    return {
        timestamp: Date.now(),
        state: classify(html, url),
        urlFamily: urlFamily(url),
        title: categorizeTitle($('title').first().text().trim()),
        selectorCounts,
        adapterVersion,
        domFingerprint: domFingerprint(html),
    };
}

export class DiagnosticsService {
    /**
     * Resolvido a cada uso, nunca no import (DEV-002). Este módulo é
     * importado pelo `main.ts` via `sigaa.service`, e imports são içados:
     * um caminho fixado no construtor aponta para o `userData` de produção
     * mesmo em desenvolvimento.
     */
    private get dir(): string {
        return path.join(app.getPath('userData'), 'diagnostics');
    }

    record(diagnostic: StructuralDiagnostic): void {
        fs.mkdirSync(this.dir, { recursive: true });
        const file = path.join(this.dir, `${diagnostic.timestamp}-${randomUUID()}.json`);
        fs.writeFileSync(file, JSON.stringify(diagnostic));
        this.prune();
    }

    /** Ordena pelo timestamp embutido no nome do arquivo, não pela string — "10" vem antes de "2" em ordem lexicográfica. */
    private prune(): void {
        const entries = fs
            .readdirSync(this.dir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => ({ name, timestamp: Number(name.split('-')[0]) }))
            .sort((a, b) => a.timestamp - b.timestamp);
        const excess = entries.length - MAX_RETAINED;
        for (let i = 0; i < excess; i++) fs.unlinkSync(path.join(this.dir, entries[i].name));
    }

    clear(): void {
        if (!fs.existsSync(this.dir)) return;
        fs.rmSync(this.dir, { recursive: true, force: true });
    }
}

export const diagnosticsService = new DiagnosticsService();
