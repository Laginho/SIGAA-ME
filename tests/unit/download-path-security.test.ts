/**
 * DL-001 — pure path-security functions.
 *
 * These test `sanitizeSegment`, `resolveDownloadTarget`, `isInsideRoot` and
 * `ensureDirInsideRoot` from `electron/services/download-path.ts` (to be
 * created by MAKE). The module does not exist yet, so every test will fail
 * with a module-not-found error — a legitimate red.
 *
 * fs is REAL in a mkdtempSync temp dir, cleaned up in afterEach.
 * The object under test is the resolved path on disk, not a mock.
 */

import { mkdtempSync, rmSync, symlinkSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Import the functions under test — module does not exist yet → red.
import {
  sanitizeSegment,
  resolveDownloadTarget,
  isInsideRoot,
  ensureDirInsideRoot,
} from '../../electron/services/download-path';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'dl001-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ── sanitizeSegment ────────────────────────────────────────────

describe('sanitizeSegment', () => {
  it('replaces path separators and illegal chars with _', () => {
    // separators become _; a leading '..' is harmless once no separator follows it
    expect(sanitizeSegment('../../etc/passwd', 150)).toBe('.._.._etc_passwd');
  });

  it('strips colons and backslashes (drive prefix)', () => {
    const result = sanitizeSegment('C:\\Windows\\x.pdf', 150);
    expect(result).not.toContain(':');
    expect(result).not.toContain('\\');
  });

  it('strips leading slash (absolute component)', () => {
    const result = sanitizeSegment('/etc/x', 150);
    expect(result).not.toContain('/');
  });

  it('throws on traversal-only names', () => {
    expect(() => sanitizeSegment('..', 150)).toThrow();
  });

  it('throws on dot-only names', () => {
    expect(() => sanitizeSegment('.', 150)).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => sanitizeSegment('', 150)).toThrow();
  });

  it('throws on whitespace-only string', () => {
    expect(() => sanitizeSegment('   ', 150)).toThrow();
  });

  it('throws on dots-only string', () => {
    expect(() => sanitizeSegment('...', 150)).toThrow();
  });

  it('prefixes Windows reserved names with _', () => {
    expect(sanitizeSegment('CON', 150)).toMatch(/^_/);
  });

  it('prefixes nul.txt (reserved without extension)', () => {
    expect(sanitizeSegment('nul.txt', 150)).toMatch(/^_/);
  });

  it('prefixes com1.PDF (case-insensitive)', () => {
    expect(sanitizeSegment('com1.PDF', 150)).toMatch(/^_/);
  });

  it('trims trailing dots', () => {
    expect(sanitizeSegment('lista.', 150)).toBe('lista');
  });

  it('truncates long name preserving extension', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const result = sanitizeSegment(longName, 150);
    expect(result.length).toBeLessThanOrEqual(150);
    expect(result).toMatch(/\.pdf$/);
  });

  it('leaves a normal name intact', () => {
    expect(sanitizeSegment('Lista 3.pdf', 150)).toBe('Lista 3.pdf');
  });
});

// ── resolveDownloadTarget ──────────────────────────────────────

describe('resolveDownloadTarget', () => {
  it('resolves a normal course/file pair inside root', () => {
    const { dir, fullPath } = resolveDownloadTarget(tmp, 'Cálculo I', 'Lista 3.pdf');
    expect(fullPath).toBe(path.join(dir, 'Lista 3.pdf'));
    expect(isInsideRoot(tmp, fullPath)).toBe(true);
  });

  it('sanitizes traversal in course name so result stays inside root', () => {
    const { fullPath } = resolveDownloadTarget(tmp, '../../fora', 'x.pdf');
    expect(isInsideRoot(tmp, fullPath)).toBe(true);
  });
});

// ── isInsideRoot ───────────────────────────────────────────────

describe('isInsideRoot', () => {
  it('returns false for path above root', () => {
    expect(isInsideRoot(tmp, path.join(tmp, '..', 'x'))).toBe(false);
  });

  it('returns false for absolute path outside root (Windows)', () => {
    // On Linux this resolves relative; the important thing is the test
    // exercises the isInsideRoot function with an absolute input.
    const abs = process.platform === 'win32' ? 'C:\\Windows' : '/etc';
    expect(isInsideRoot(tmp, abs)).toBe(false);
  });

  it('returns false for root itself (root is not a file destination)', () => {
    expect(isInsideRoot(tmp, tmp)).toBe(false);
  });

  it('returns true for a child whose name starts with dots (a name, not traversal)', () => {
    expect(isInsideRoot(tmp, path.join(tmp, '..fora', 'x.pdf'))).toBe(true);
  });
});

// ── ensureDirInsideRoot (symlink/junction escape) ──────────────

describe('ensureDirInsideRoot — symlink/junction escape', () => {
  it('throws when target is a junction/symlink escaping root', () => {
    const escape = mkdtempSync(path.join(os.tmpdir(), 'dl001-escape-'));
    const link = path.join(tmp, 'Turma');
    try {
      symlinkSync(
        escape,
        link,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      expect(() => ensureDirInsideRoot(tmp, link)).toThrow();
    } catch (e: any) {
      // Junction creation may require elevated privileges on some Windows
      // configurations. Skip the test rather than silently swallowing.
      if (e.code === 'EPERM' || e.code === 'EACCES') {
        return; // effectively: it.skip('symlink/junction requires privileges')
      }
      throw e;
    } finally {
      rmSync(escape, { recursive: true, force: true });
    }
  });
});
