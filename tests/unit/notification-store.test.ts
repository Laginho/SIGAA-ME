// @vitest-environment jsdom
/**
 * Characterizes notification-store.ts (src/utils) — the read/unread state
 * and notification history behind the bell. See plans/002; the
 * "Characterization:" case pins a quirk plan 004 may revisit.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    courseHasUnread,
    getAllNotifications,
    getUnreadCount,
    isItemRead,
    markAllAsRead,
    markAsRead,
    NotificationItem,
    pushNotifications,
    seedExistingItemsAsRead
} from '../../src/utils/notification-store';

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
    return {
        id: 'file-c1-a.pdf',
        type: 'file',
        courseId: 'c1',
        courseName: 'Course 1',
        itemId: 'a.pdf',
        itemTitle: 'a.pdf',
        timestamp: Date.now(),
        read: false,
        ...overrides
    };
}

describe('notification-store', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('stores pushed items and returns them most-recent-first', () => {
        pushNotifications([makeItem({ id: 'a' })]);
        pushNotifications([makeItem({ id: 'b' })]);

        expect(getAllNotifications().map(n => n.id)).toEqual(['b', 'a']);
    });

    it('dedupes by id: pushing the same id twice keeps only one entry', () => {
        pushNotifications([makeItem({ id: 'a' })]);
        pushNotifications([makeItem({ id: 'a' })]);

        expect(getAllNotifications().filter(n => n.id === 'a')).toHaveLength(1);
    });

    it('carries prior read state forward when a notification with the same key is pushed', () => {
        markAsRead('file', 'c1', 'a.pdf');

        pushNotifications([makeItem({ id: 'file-c1-a.pdf' })]);

        expect(getAllNotifications()[0].read).toBe(true);
    });

    it('Characterization: pushing past MAX_NOTIFICATIONS(15) silently drops the overflow, including from unread tracking', () => {
        // pushNotifications keeps [...newItems, ...existing].slice(0, 15) — with a single
        // push of 20 brand-new items, the array's first 15 entries survive and the last 5
        // (index 15..19) fall off the end. Put those 5 in their own course so we can assert
        // that course's unread flag is (wrongly) false, not just that items disappeared.
        const surviving = Array.from({ length: 15 }, (_, i) => makeItem({ id: `keep-${i}`, courseId: 'kept-course', itemId: `${i}` }));
        const overflow = Array.from({ length: 5 }, (_, i) => makeItem({ id: `drop-${i}`, courseId: 'overflowed-only-course', itemId: `${i}` }));
        pushNotifications([...surviving, ...overflow]);

        const stored = getAllNotifications();
        expect(stored).toHaveLength(15);
        expect(stored.map(n => n.id)).toEqual(surviving.map(n => n.id));
        expect(courseHasUnread('overflowed-only-course')).toBe(false);
    });

    it('marks everything read: getUnreadCount drops to 0 and every item is read', () => {
        pushNotifications([makeItem(), makeItem({ id: 'file-c2-b.pdf', courseId: 'c2', itemId: 'b.pdf' })]);

        markAllAsRead();

        expect(getUnreadCount()).toBe(0);
        expect(isItemRead('file', 'c1', 'a.pdf')).toBe(true);
        expect(isItemRead('file', 'c2', 'b.pdf')).toBe(true);
    });

    it('seedExistingItemsAsRead is idempotent: a second call with different data changes nothing', () => {
        localStorage.setItem('coursesWithFiles', JSON.stringify([
            { id: 'c1', files: [{ name: 'old.pdf' }], news: [{ id: 'n1' }] }
        ]));

        seedExistingItemsAsRead();
        expect(isItemRead('file', 'c1', 'old.pdf')).toBe(true);
        expect(isItemRead('file', 'c1', 'new.pdf')).toBe(false);

        localStorage.setItem('coursesWithFiles', JSON.stringify([
            { id: 'c1', files: [{ name: 'new.pdf' }], news: [] }
        ]));
        seedExistingItemsAsRead();

        expect(isItemRead('file', 'c1', 'old.pdf')).toBe(true);
        expect(isItemRead('file', 'c1', 'new.pdf')).toBe(false);
    });

    it('returns empty defaults instead of throwing when either key holds corrupt JSON', () => {
        localStorage.setItem('readItems', '{not-json');
        localStorage.setItem('notificationsHistory', '{not-json');

        expect(() => getAllNotifications()).not.toThrow();
        expect(getAllNotifications()).toEqual([]);
        expect(isItemRead('file', 'c1', 'a.pdf')).toBe(false);
        expect(getUnreadCount()).toBe(0);
    });
});
