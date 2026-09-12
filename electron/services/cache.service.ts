import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AccountId, CourseId } from '../../shared/domain';
import { logger } from './logger.service';

const log = logger.scope('Cache');

export interface CourseState {
    files: string[]; // List of file IDs
    news: string[]; // List of news IDs
}

interface AccountBucket {
    courses: Record<CourseId, CourseState>;
    updatedAt: number;
}

/**
 * Formato em disco do `cache.json` (DATA-001). Um balde por conta: a linha de
 * base de "já visto" da conta A não pode servir de baseline para a conta B.
 *
 * O `accountId` entra explicitamente em todo método — não existe "conta atual"
 * escondida aqui dentro decidindo de quem é o dado.
 */
export interface CacheFileV2 {
    schemaVersion: 2;
    accounts: Record<AccountId, AccountBucket>;
}

function isIdList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(id => typeof id === 'string');
}

function parseBucket(value: unknown): AccountBucket | null {
    if (typeof value !== 'object' || value === null) return null;
    const { courses, updatedAt } = value as { courses?: unknown; updatedAt?: unknown };
    if (typeof courses !== 'object' || courses === null || Array.isArray(courses)) return null;

    for (const state of Object.values(courses)) {
        if (typeof state !== 'object' || state === null) return null;
        const { files, news } = state as { files?: unknown; news?: unknown };
        if (!isIdList(files) || !isIdList(news)) return null;
    }

    return {
        courses: courses as Record<CourseId, CourseState>,
        updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
    };
}

export class CacheService {
    private loaded: CacheFileV2 | null = null;

    /**
     * Resolvido a cada uso, nunca no import (DEV-002). Este módulo é um
     * singleton importado pelo `main.ts`, e imports são içados: qualquer
     * `app.getPath` no construtor roda antes do `app.setPath('userData', ...)`
     * que isola o dev da produção, e o `cache.json` de dev acabava em
     * `%APPDATA%\sigaa-me` em vez de `sigaa-me-dev`.
     */
    private get cachePath(): string {
        return path.join(app.getPath('userData'), 'cache.json');
    }

    private get cache(): CacheFileV2 {
        return this.loaded ??= this.loadCache();
    }

    /**
     * Um arquivo sem `schemaVersion: 2` é v1 (`{ [courseId]: state }`) e é
     * **descartado**: nada nele diz de quem era. É só a linha de base de "já
     * visto", então o custo é um cold start sem notificação — e com o v1 morre
     * também a normalização do `555'` do BUG-009, já que todo arquivo v2 é
     * escrito depois da correção do parser.
     *
     * Balde de conta malformado é largado individualmente; o resto do arquivo
     * continua valendo.
     */
    private loadCache(): CacheFileV2 {
        try {
            if (fs.existsSync(this.cachePath)) {
                const data: unknown = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
                if (typeof data === 'object' && data !== null && (data as CacheFileV2).schemaVersion === 2) {
                    const stored = (data as { accounts?: unknown }).accounts;
                    const accounts: Record<AccountId, AccountBucket> = {};
                    if (typeof stored === 'object' && stored !== null) {
                        for (const [accountId, raw] of Object.entries(stored)) {
                            const bucket = parseBucket(raw);
                            if (bucket) accounts[accountId] = bucket;
                            else log.warn('Dropping malformed cache entry for one account.');
                        }
                    }
                    return { schemaVersion: 2, accounts };
                }
                log.warn('Discarding a pre-DATA-001 cache — its baseline cannot be attributed to an account.');
            }
        } catch (error) {
            log.error('Failed to load cache', { error });
        }
        return { schemaVersion: 2, accounts: {} };
    }

    /**
     * Grava e só depois troca a memória (DATA-003). Escrita falhada lança e
     * deixa o cache como estava, em vez de fingir uma baseline salva.
     */
    private commit(next: CacheFileV2) {
        fs.writeFileSync(this.cachePath, JSON.stringify(next, null, 2));
        this.loaded = next;
    }

    public getCourseState(accountId: AccountId, courseId: CourseId): CourseState {
        return this.cache.accounts[accountId]?.courses[courseId] || { files: [], news: [] };
    }

    public updateCourseState(accountId: AccountId, courseId: CourseId, files: string[], news: string[]) {
        const bucket: AccountBucket = this.cache.accounts[accountId] ?? { courses: {}, updatedAt: 0 };
        this.commit({
            ...this.cache,
            accounts: {
                ...this.cache.accounts,
                [accountId]: { courses: { ...bucket.courses, [courseId]: { files, news } }, updatedAt: Date.now() },
            },
        });
    }

    /**
     * Compares new arrays against the cached ones, returning only the NEW items.
     * Elements should be objects with an `id` property.
     */
    public diffCourseState<F extends { id: string }, N extends { id: string }>(accountId: AccountId, courseId: CourseId, currentFiles: F[], currentNews: N[]): { newFiles: F[], newNews: N[] } {
        const cachedState = this.getCourseState(accountId, courseId);

        const newFiles = currentFiles.filter(item => item.id && !cachedState.files.includes(String(item.id)));
        const newNews = currentNews.filter(item => item.id && !cachedState.news.includes(String(item.id)));

        return { newFiles, newNews };
    }

    /**
     * Esquece todo balde de toda conta (DATA-002). Memória primeiro, disco
     * depois: um `unlink` que falhar ainda deixa o processo vivo sem os baldes
     * antigos, e a próxima escrita contém só o que vier dali em diante.
     */
    public clear(): void {
        this.loaded = { schemaVersion: 2, accounts: {} };
        if (fs.existsSync(this.cachePath)) {
            fs.unlinkSync(this.cachePath);
        }
    }

    /**
     * Só para simulação em desenvolvimento: esquece o último arquivo da primeira
     * turma da conta que tiver algum, persiste, e devolve o que esqueceu (ou null).
     */
    public forgetLastFile(accountId: AccountId): { courseId: CourseId; fileId: string } | null {
        const bucket = this.cache.accounts[accountId];
        if (!bucket) return null;

        for (const [courseId, state] of Object.entries(bucket.courses)) {
            if (state.files.length > 0) {
                const fileId = state.files.pop()!;
                this.commit(this.cache);
                return { courseId, fileId };
            }
        }
        return null;
    }
}

export const cacheService = new CacheService();
