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
        return `hoje às ${cacheDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    const day = cacheDate.getDate().toString().padStart(2, '0');
    const month = (cacheDate.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month} às ${cacheDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
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
