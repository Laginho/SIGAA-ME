import { beforeEach, expect, it, vi } from 'vitest';
const disk = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('fs', () => ({ existsSync: () => false, writeFileSync: disk.write }));
vi.mock('electron', () => ({ app: { getPath: () => 'audit-user-data' }, safeStorage: {} }));
vi.mock('../../electron/services/logger.service', () => ({ logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) } }));
import { PersistenceService } from '../../electron/services/persistence.service';
import { CacheService } from '../../electron/services/cache.service';
beforeEach(() => { disk.write.mockReset().mockImplementation(() => { throw new Error('ENOSPC'); }); });
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
