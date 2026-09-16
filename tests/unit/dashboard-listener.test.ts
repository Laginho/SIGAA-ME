// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../../src/components/toast';
import { accountKey, readAccountItem, setActiveAccount, writeAccountItem } from '../../src/data/account-storage';
import { handleBackgroundSyncUpdate, renderDashboardPage } from '../../src/pages/dashboard';
import { getAllNotifications } from '../../src/utils/notification-store';

// DATA-001: o evento precisa vir carimbado com a conta ativa para ser aceito.
const ACCOUNT = { id: 'acc-test', name: 'ALUNO' };

describe('handleBackgroundSyncUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setActiveAccount(ACCOUNT);
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

  it('wires a downloads payload into the account downloads index (DL-006 critério 6)', () => {
    handleBackgroundSyncUpdate({
      accountId: ACCOUNT.id,
      courses: [],
      notifications: [],
      timestamp: Date.now(),
      downloads: [
        {
          courseId: 'c1',
          records: [{ fileId: 'f1', fileName: 'lista.pdf', status: 'downloaded', filePath: '/downloads/Course 1/lista.pdf' }],
        },
      ],
    });

    const stored = JSON.parse(readAccountItem('downloads') || '{}');
    expect(stored.c1.f1.path).toBe('/downloads/Course 1/lista.pdf');
  });

  it('a quota error recording downloads does not stop the course merge or the notification toast (DL-006 achado 2)', () => {
    const quotaError = new Error('QuotaExceededError');
    quotaError.name = 'QuotaExceededError';
    const downloadsKey = accountKey(ACCOUNT.id, 'downloads');
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key: string, value: string) {
      if (key === downloadsKey) throw quotaError;
      return originalSetItem.call(this, key, value);
    });
    const toastInfo = vi.spyOn(toast, 'info');

    expect(() => handleBackgroundSyncUpdate({
      accountId: ACCOUNT.id,
      courses: [{ id: 'C1', news: [] }],
      notifications: [{ id: 'N1', title: 'New item', read: false }],
      timestamp: Date.now(),
      downloads: [
        { courseId: 'c1', records: [{ fileId: 'f1', fileName: 'lista.pdf', status: 'downloaded', filePath: '/downloads/Course 1/lista.pdf' }] },
      ],
    })).not.toThrow();

    expect(readAccountItem('sync-timestamp')).not.toBeNull();
    expect(toastInfo).toHaveBeenCalledWith('1 nova(s) atualização(ões) encontrada(s).');
  });

  // BUG-016: um ciclo em background que não cobriu todas as turmas não pode
  // ser tratado como "turma saiu da matrícula" — perderia arquivos e notícias
  // já em cache da turma que só falhou desta vez.
  it('an incomplete cycle keeps a course absent from the payload, with its cached files', () => {
    writeAccountItem('courses', JSON.stringify([
      { id: 'A', name: 'Course A', files: [], news: [] },
      { id: 'B', name: 'Course B', files: [{ id: 'f1', name: 'lista.pdf' }], news: [{ id: 'n1', content: 'BODY' }] },
    ]));

    handleBackgroundSyncUpdate({
      accountId: ACCOUNT.id,
      courses: [{ id: 'A', name: 'Course A Updated', files: [], news: [] }],
      notifications: [],
      timestamp: Date.now(),
      incomplete: true,
    });

    const result = JSON.parse(readAccountItem('courses') || '[]');
    const byId = Object.fromEntries(result.map((c: any) => [c.id, c]));
    expect(byId['B']).toEqual({ id: 'B', name: 'Course B', files: [{ id: 'f1', name: 'lista.pdf' }], news: [{ id: 'n1', content: 'BODY' }] });
    expect(byId['A'].name).toBe('Course A Updated');
  });

  it('a complete cycle drops a course absent from the payload (it left the enrollment)', () => {
    writeAccountItem('courses', JSON.stringify([
      { id: 'A', name: 'Course A', files: [], news: [] },
      { id: 'B', name: 'Course B', files: [], news: [] },
    ]));

    handleBackgroundSyncUpdate({
      accountId: ACCOUNT.id,
      courses: [{ id: 'A', name: 'Course A Updated', files: [], news: [] }],
      notifications: [],
      timestamp: Date.now(),
    });

    const result = JSON.parse(readAccountItem('courses') || '[]');
    expect(result.map((c: any) => c.id)).toEqual(['A']);
  });
});

describe('renderDashboardPage: dropdown outside-click listener', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
    setActiveAccount(ACCOUNT);
    vi.restoreAllMocks();
  });

  function installMinimalApi() {
    const api = {
      getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
      onBackgroundSyncUpdate: vi.fn(() => () => undefined),
      getCompatibilityStatus: vi.fn().mockResolvedValue({ state: 'ok' }),
      onCompatibilityChanged: vi.fn(() => () => undefined),
    };
    Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
    return api;
  }

  // BUG-016 item 21: cada montagem soma um listener de `click` em `document`
  // (fecha o dropdown ao clicar fora) e nunca o remove — cada render vaza uma
  // closure sobre o dropdown da montagem anterior.
  it('renders three times and leaves exactly one active click listener on document', () => {
    installMinimalApi();
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const app = document.createElement('div');
    document.body.replaceChildren(app);
    renderDashboardPage(app, { ...ACCOUNT });
    renderDashboardPage(app, { ...ACCOUNT });
    renderDashboardPage(app, { ...ACCOUNT });

    const added = addSpy.mock.calls.filter((call) => call[0] === 'click').length;
    const removed = removeSpy.mock.calls.filter((call) => call[0] === 'click').length;
    expect(added - removed).toBe(1);
  });
});
