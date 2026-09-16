import { beforeEach, expect, it, vi } from 'vitest';
const disk = vi.hoisted(() => ({ write: vi.fn(), exists: vi.fn(() => false), read: vi.fn(() => '') }));
vi.mock('fs', () => ({ existsSync: disk.exists, readFileSync: disk.read, writeFileSync: disk.write }));
vi.mock('electron', () => ({ app: { getPath: () => 'audit-user-data' }, safeStorage: {} }));
const loggerSpy = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));
vi.mock('../../electron/services/logger.service', () => ({ logger: { scope: () => loggerSpy } }));
import { PersistenceService } from '../../electron/services/persistence.service';
import { CacheService } from '../../electron/services/cache.service';
beforeEach(() => {
    disk.write.mockReset().mockImplementation(() => { throw new Error('ENOSPC'); });
    disk.exists.mockReset().mockReturnValue(false);
    disk.read.mockReset().mockReturnValue('');
    loggerSpy.error.mockClear();
    loggerSpy.warn.mockClear();
});
it('reports failed settings writes and retains the last settings', () => {
    const service = new PersistenceService();
    const before = service.getSettings();
    expect(() => service.applySetting({ key: 'syncInterval', value: 90 })).toThrow('ENOSPC');
    expect(service.getSettings()).toEqual(before);
    expect(() => service.updateSetting('syncInterval', 90)).toThrow('ENOSPC');
    expect(service.getSettings()).toEqual(before);
});
it('reports failed cache writes instead of claiming a saved baseline', () => {
    const service = new CacheService();
    expect(() => service.updateCourseState('account', 'course', ['file'], [])).toThrow('ENOSPC');
    expect(service.getCourseState('account', 'course')).toEqual({ files: [], news: [] });
});
it('falls back to defaults and warns with the filename (not the content) when settings.json fails to parse', () => {
    disk.exists.mockReturnValue(true);
    disk.read.mockReturnValue('{not-json');

    const service = new PersistenceService();

    expect(service.getSettings().syncInterval).toBe(60);
    expect(loggerSpy.warn).toHaveBeenCalledWith(expect.any(String), { file: 'settings.json' });
});
