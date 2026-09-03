/**
 * Notification Store
 *
 * Lightweight localStorage-based manager for:
 *  1. Read/Unread state of news items and files
 *  2. Notification history (the feed shown in the bell dropdown)
 *
 * All state lives in localStorage so it survives app restarts
 * without needing any backend persistence changes.
 */

const READ_ITEMS_KEY = 'readItems';
const NOTIFICATIONS_KEY = 'notificationsHistory';
const MAX_NOTIFICATIONS = 15;

// O main constrói estes itens no background sync e os manda pelo IPC, então o
// tipo vive em shared/domain.ts (ARCH-001). Reexportado para os imports locais.
export type { NotificationItem } from '../../shared/domain';
import type { NotificationItem } from '../../shared/domain';

// ─── Read State ──────────────────────────────────────────

/** Get the set of read item keys */
function getReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_ITEMS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadSet(set: Set<string>) {
  localStorage.setItem(READ_ITEMS_KEY, JSON.stringify([...set]));
}

/** Build a unique key for an item */
function itemKey(type: 'file' | 'news', courseId: string, itemId: string): string {
  return `${type}-${courseId}-${itemId}`;
}

/** Check if a specific item has been read */
export function isItemRead(type: 'file' | 'news', courseId: string, itemId: string): boolean {
  return getReadSet().has(itemKey(type, courseId, itemId));
}

/** Mark a single item as read */
export function markAsRead(type: 'file' | 'news', courseId: string, itemId: string) {
  const set = getReadSet();
  set.add(itemKey(type, courseId, itemId));
  saveReadSet(set);

  // Also mark in notifications history
  const notifications = getNotifications();
  const key = itemKey(type, courseId, itemId);
  let changed = false;
  notifications.forEach(n => {
    if (n.id === key && !n.read) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) saveNotifications(notifications);
}

/** Mark all items as read */
export function markAllAsRead() {
  const notifications = getNotifications();
  const set = getReadSet();
  notifications.forEach(n => {
    n.read = true;
    set.add(n.id);
  });
  saveReadSet(set);
  saveNotifications(notifications);
}

/** Check if a course has any unread items */
export function courseHasUnread(courseId: string): boolean {
  const notifications = getNotifications();
  return notifications.some(n => n.courseId === courseId && !n.read);
}

/** Count total unread notifications */
export function getUnreadCount(): number {
  return getNotifications().filter(n => !n.read).length;
}

// ─── Notification History ────────────────────────────────

function getNotifications(): NotificationItem[] {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotifications(items: NotificationItem[]) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items));
}

/** Push new notification items (deduplicates by id) */
export function pushNotifications(items: NotificationItem[]) {
  const existing = getNotifications();
  const existingIds = new Set(existing.map(n => n.id));
  const readSet = getReadSet();

  const newItems = items
    .filter(item => !existingIds.has(item.id))
    .map(item => ({ ...item, read: readSet.has(item.id) }));

  if (newItems.length === 0) return;

  // Prepend new items, cap at MAX
  const merged = [...newItems, ...existing].slice(0, MAX_NOTIFICATIONS);
  saveNotifications(merged);
}

/** Get all notifications (most recent first) */
export function getAllNotifications(): NotificationItem[] {
  return getNotifications();
}

/** Clear all notification history */
export function clearAllNotifications() {
  localStorage.removeItem(NOTIFICATIONS_KEY);
}

/**
 * Seed initial read state for items that existed BEFORE
 * the notification system was added (so old items don't
 * show as "new" after the update).
 */
export function seedExistingItemsAsRead() {
  if (localStorage.getItem(READ_ITEMS_KEY)) return; // Already seeded

  const raw = localStorage.getItem('coursesWithFiles');
  if (!raw) return;

  try {
    const courses = JSON.parse(raw);
    const set = new Set<string>();

    for (const course of courses) {
      if (course.news) {
        for (const n of course.news) {
          set.add(itemKey('news', course.id, n.id));
        }
      }
      if (course.files) {
        for (const f of course.files) {
          set.add(itemKey('file', course.id, f.name));
        }
      }
    }

    saveReadSet(set);
  } catch {
    // Ignore parse errors
  }
}
