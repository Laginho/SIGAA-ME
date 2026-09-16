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
import { readAccountItem, setActiveAccount, writeAccountItem } from '../../src/data/account-storage';

// DATA-001: notificações e lidos são por conta.
const ACCOUNT = { id: 'acc-test', name: 'ALUNO' };

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
        sessionStorage.clear();
        setActiveAccount(ACCOUNT);
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
        writeAccountItem('courses', JSON.stringify([
            { id: 'c1', files: [{ id: '1', name: 'old.pdf' }], news: [{ id: 'n1' }] }
        ]));

        seedExistingItemsAsRead();
        expect(isItemRead('file', 'c1', '1')).toBe(true);
        expect(isItemRead('file', 'c1', '2')).toBe(false);

        writeAccountItem('courses', JSON.stringify([
            { id: 'c1', files: [{ id: '2', name: 'new.pdf' }], news: [] }
        ]));
        seedExistingItemsAsRead();

        expect(isItemRead('file', 'c1', '1')).toBe(true);
        expect(isItemRead('file', 'c1', '2')).toBe(false);
    });

    it('keeps two entries for two new files that share a name but not an id', () => {
        pushNotifications([
            makeItem({ id: 'file-c1-101', itemId: '101', itemTitle: 'Lista.pdf' }),
            makeItem({ id: 'file-c1-102', itemId: '102', itemTitle: 'Lista.pdf' })
        ]);

        expect(getAllNotifications()).toHaveLength(2);
        expect(getAllNotifications().every(n => !n.read)).toBe(true);
    });

    it('re-seeds read state by id when the previous seed was keyed by name (v1 → v2 migration)', () => {
        // v1: seeded before BUG-015, keyed by name, no version marker.
        writeAccountItem('read-items', JSON.stringify(['file-c1-old.pdf']));
        writeAccountItem('courses', JSON.stringify([
            { id: 'c1', files: [{ id: '10', name: 'old.pdf' }, { id: '11', name: 'new.pdf' }], news: [] }
        ]));

        seedExistingItemsAsRead();

        expect(isItemRead('file', 'c1', '10')).toBe(true);
        expect(isItemRead('file', 'c1', '11')).toBe(true);
        expect(readAccountItem('read-items-seed-version')).toBe('v2');

        // Running again does not re-seed: a file added to the cache after the
        // migration stays unread, same as the existing idempotency contract.
        writeAccountItem('courses', JSON.stringify([
            { id: 'c1', files: [{ id: '10', name: 'old.pdf' }, { id: '11', name: 'new.pdf' }, { id: '12', name: 'newer.pdf' }], news: [] }
        ]));
        seedExistingItemsAsRead();

        expect(isItemRead('file', 'c1', '12')).toBe(false);
    });

    it('returns empty defaults instead of throwing when either scoped key holds corrupt JSON', () => {
        writeAccountItem('read-items', '{not-json');
        writeAccountItem('notifications', '{not-json');

        expect(() => getAllNotifications()).not.toThrow();
        expect(getAllNotifications()).toEqual([]);
        expect(isItemRead('file', 'c1', 'a.pdf')).toBe(false);
        expect(getUnreadCount()).toBe(0);
    });

    it('DATA-005: returns [] for a notifications value that parses but is not an array, and drops entries without a string id', () => {
        writeAccountItem('notifications', '{}');
        expect(getAllNotifications()).toEqual([]);

        writeAccountItem('notifications', JSON.stringify([{ id: 1 }, { id: 'ok', type: 'file' }]));
        expect(getAllNotifications()).toEqual([{ id: 'ok', type: 'file' }]);
    });

    it('DATA-005: treats a read-items value that is not an array of strings as an empty set, without throwing', () => {
        writeAccountItem('read-items', JSON.stringify('x'));

        expect(() => markAsRead('file', 'c1', 'a.pdf')).not.toThrow();

        const stored = JSON.parse(readAccountItem('read-items') || '[]');
        expect(stored).toEqual(['file-c1-a.pdf']);
    });
});
