// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/toast';
import { accountKey, readAccountItem, setActiveAccount } from '../../src/data/account-storage';
import { handleBackgroundSyncUpdate } from '../../src/pages/dashboard';
import { clearAllNotifications, getAllNotifications } from '../../src/utils/notification-store';

// DATA-001: o evento precisa vir carimbado com a conta ativa para ser aceito.
const ACCOUNT = { id: 'acc-test', name: 'ALUNO' };

describe('handleBackgroundSyncUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActiveAccount(ACCOUNT);
    clearAllNotifications();
    vi.restoreAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('surfaces a quota error without advancing the cache or notifications', () => {
    const quotaError = new Error('QuotaExceededError');
    quotaError.name = 'QuotaExceededError';
    const coursesKey = accountKey(ACCOUNT.id, 'courses');
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === coursesKey) throw quotaError;
      return originalSetItem.call(this, key, value);
    });
    const toastError = vi.spyOn(toast, 'error');
    const toastInfo = vi.spyOn(toast, 'info');

    expect(() => handleBackgroundSyncUpdate({
      accountId: ACCOUNT.id,
      courses: [{ id: 'C1', news: [] }],
      notifications: [{ id: 'N1', title: 'New item', read: false }],
      timestamp: Date.now(),
    })).not.toThrow();

    expect(toastError).toHaveBeenCalledWith('Cache local cheio (armazenamento do navegador) — QuotaExceededError');
    expect(toastInfo).not.toHaveBeenCalled();
    expect(readAccountItem('sync-timestamp')).toBeNull();
    expect(getAllNotifications()).toEqual([]);
  });
});
