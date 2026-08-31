// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/toast';
import { handleBackgroundSyncUpdate } from '../../src/pages/dashboard';
import { clearAllNotifications, getAllNotifications } from '../../src/utils/notification-store';

describe('handleBackgroundSyncUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    clearAllNotifications();
    vi.restoreAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('surfaces a quota error without advancing the cache or notifications', () => {
    const quotaError = new Error('QuotaExceededError');
    quotaError.name = 'QuotaExceededError';
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === 'coursesWithFiles') throw quotaError;
      return originalSetItem.call(this, key, value);
    });
    const toastError = vi.spyOn(toast, 'error');
    const toastInfo = vi.spyOn(toast, 'info');

    expect(() => handleBackgroundSyncUpdate({
      courses: [{ id: 'C1', news: [] }],
      notifications: [{ id: 'N1', title: 'New item', read: false }],
      timestamp: Date.now(),
    })).not.toThrow();

    expect(toastError).toHaveBeenCalledWith('Cache local cheio (localStorage) — QuotaExceededError');
    expect(toastInfo).not.toHaveBeenCalled();
    expect(localStorage.getItem('cacheTimestamp')).toBeNull();
    expect(getAllNotifications()).toEqual([]);
  });
});
