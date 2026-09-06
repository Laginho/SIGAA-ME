import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { AccountId, CourseId } from '../../shared/domain';

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
    private cachePath: string;
    private cache: CacheFileV2;

    constructor() {
        this.cachePath = path.join(app.getPath('userData'), 'cache.json');
        this.cache = this.loadCache();
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
                            else console.warn(`CacheService: Dropping malformed cache entry for one account.`);
                        }
                    }
                    return { schemaVersion: 2, accounts };
                }
                console.warn('CacheService: Discarding a pre-DATA-001 cache — its baseline cannot be attributed to an account.');
            }
        } catch (error) {
            console.error('CacheService: Failed to load cache:', error);
        }
        return { schemaVersion: 2, accounts: {} };
    }

    private saveCache() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            console.error('CacheService: Failed to save cache:', error);
        }
    }

    private bucket(accountId: AccountId): AccountBucket {
        return this.cache.accounts[accountId] ??= { courses: {}, updatedAt: 0 };
    }

    public getCourseState(accountId: AccountId, courseId: CourseId): CourseState {
        return this.cache.accounts[accountId]?.courses[courseId] || { files: [], news: [] };
    }

    public updateCourseState(accountId: AccountId, courseId: CourseId, files: string[], news: string[]) {
        const bucket = this.bucket(accountId);
        bucket.courses[courseId] = { files, news };
        bucket.updatedAt = Date.now();
        this.saveCache();
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
     * Só para simulação em desenvolvimento: esquece o último arquivo da primeira
     * turma da conta que tiver algum, persiste, e devolve o que esqueceu (ou null).
     */
    public forgetLastFile(accountId: AccountId): { courseId: CourseId; fileId: string } | null {
        const bucket = this.cache.accounts[accountId];
        if (!bucket) return null;

        for (const [courseId, state] of Object.entries(bucket.courses)) {
            if (state.files.length > 0) {
                const fileId = state.files.pop()!;
                this.saveCache();
                return { courseId, fileId };
            }
        }
        return null;
    }
}

export const cacheService = new CacheService();
