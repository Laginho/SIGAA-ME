import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface CourseState {
    files: string[]; // List of file IDs
    news: string[]; // List of news IDs
}

export interface CacheData {
    [courseId: string]: CourseState;
}

export class CacheService {
    private cachePath: string;
    private cache: CacheData;

    constructor() {
        this.cachePath = path.join(app.getPath('userData'), 'cache.json');
        this.cache = this.loadCache();
    }

    private loadCache(): CacheData {
        try {
            if (fs.existsSync(this.cachePath)) {
                const data: CacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
                // BUG-009: antes da correção do parser, ids de arquivo iam para o disco
                // com a quote de fechamento do JSF (`555'`). Normaliza na leitura para
                // que um cache antigo não faça todo arquivo parecer novo (e disparar
                // re-download geral); a próxima gravação já persiste limpo.
                for (const state of Object.values(data)) {
                    state.files = state.files.map(id => id.replace(/['"]$/, ''));
                }
                return data;
            }
        } catch (error) {
            console.error('CacheService: Failed to load cache:', error);
        }
        return {};
    }

    private saveCache() {
        try {
            fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
        } catch (error) {
            console.error('CacheService: Failed to save cache:', error);
        }
    }

    public getCourseState(courseId: string): CourseState {
        return this.cache[courseId] || { files: [], news: [] };
    }

    public updateCourseState(courseId: string, files: string[], news: string[]) {
        this.cache[courseId] = { files, news };
        this.saveCache();
    }

    /**
     * Compares new arrays against the cached ones, returning only the NEW items.
     * Elements should be objects with an `id` property.
     */
    public diffCourseState(courseId: string, currentFiles: any[], currentNews: any[]): { newFiles: any[], newNews: any[] } {
        const cachedState = this.getCourseState(courseId);
        
        const newFiles = currentFiles.filter(item => item.id && !cachedState.files.includes(String(item.id)));
        const newNews = currentNews.filter(item => item.id && !cachedState.news.includes(String(item.id)));

        return { newFiles, newNews };
    }
}

export const cacheService = new CacheService();
