/**
 * Utility: Sync Badge Label Formatter
 *
 * Converts a Unix timestamp (ms) into a human-readable relative label.
 * Extracted from dashboard.ts to be independently unit-testable.
 *
 * Examples:
 *   - 30s ago    → "agora mesmo"
 *   - 15min ago  → "há 15 min"
 *   - same day   → "hoje às 14:32"
 *   - other day  → "15/04 às 09:00"
 */
export function formatSyncLabel(timestampMs: number, now: Date = new Date()): string {
    const cacheDate = new Date(timestampMs);
    const diffMs = now.getTime() - cacheDate.getTime();
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} min`;
    if (cacheDate.toDateString() === now.toDateString()) {
        return `hoje às ${formatClock(cacheDate)}`;
    }
    const day = cacheDate.getDate().toString().padStart(2, '0');
    const month = (cacheDate.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month} às ${formatClock(cacheDate)}`;
}

/**
 * Relógio 24h fixo no locale pt-BR.
 *
 * `toLocaleTimeString([], ...)` usa o locale da máquina: num sistema en-US isso
 * vira "12:30 PM" no meio de uma string em português. O app é pt-BR, então o
 * formato não deve depender de como o usuário configurou o sistema dele.
 */
function formatClock(date: Date): string {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Utility: News Cache Checker
 *
 * Returns true if the given newsId already has its content cached in localStorage.
 * Extracted from course-detail.ts (openNewsModal) to be independently unit-testable.
 */
export function isNewsCached(courseId: string, newsId: string): boolean {
    try {
        const raw = localStorage.getItem('coursesWithFiles');
        if (!raw) return false;
        const courses = JSON.parse(raw);
        const course = courses.find((c: any) => c.id === courseId);
        return !!(course?.news?.find((n: any) => n.id === newsId)?.content);
    } catch {
        return false;
    }
}

export interface MergeOptions {
    /** When true, courses absent from `incoming` are removed (use only after a
     *  complete successful sync over the full enrollment). Default false. */
    replaceSet?: boolean;
}

/**
 * Utility: Merge Courses Into Cache
 *
 * Writes `incoming` courses into the `coursesWithFiles` blob without wiping
 * data a partial or fast sync doesn't touch:
 *   - News bodies (`content`) already cached are re-injected when the
 *     incoming item lacks one (a fast sync only returns headers).
 *   - Courses not present in `incoming` are kept unless `replaceSet: true`
 *     (a partial sync must not drop the courses it hasn't reached yet).
 *
 * Shared by the manual sync loop (`sync-selection.ts`) and the background
 * sync push (`dashboard.ts`) — the two writers of this cache.
 */
export function mergeCoursesIntoCache(incoming: any[], opts: MergeOptions = {}, timestamp: number = Date.now()): void {
    const existingRaw = localStorage.getItem('coursesWithFiles');
    let existingCourses: any[] = [];
    if (existingRaw) {
        try {
            existingCourses = JSON.parse(existingRaw);
        } catch {
            existingCourses = [];
        }
    }

    // Build a lookup of cached news content: "courseId-newsId" -> content
    const contentMap = new Map<string, string>();
    for (const course of existingCourses) {
        if (course.news) {
            for (const n of course.news) {
                if (n.content) contentMap.set(`${course.id}-${n.id}`, n.content);
            }
        }
    }
    // Re-inject cached content into incoming data where missing
    for (const course of incoming) {
        if (course.news) {
            for (const n of course.news) {
                if (!n.content) {
                    const cached = contentMap.get(`${course.id}-${n.id}`);
                    if (cached) n.content = cached;
                }
            }
        }
    }

    const merged: any[] = opts.replaceSet ? [...incoming] : [...existingCourses];
    if (!opts.replaceSet) {
        for (const course of incoming) {
            const idx = merged.findIndex((c) => c.id === course.id);
            if (idx >= 0) merged[idx] = course;
            else merged.push(course);
        }
    }

    try {
        localStorage.setItem('coursesWithFiles', JSON.stringify(merged));
    } catch (err: any) {
        throw new Error('Cache local cheio (localStorage) — ' + err.message);
    }
    localStorage.setItem('cacheTimestamp', timestamp.toString());
}
