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
                const data = fs.readFileSync(this.cachePath, 'utf8');
                return JSON.parse(data);
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
