/**
 * Validadores puros da fronteira renderer <-> main (SEC-002).
 *
 * Sem dependência de Electron: cada função devolve o valor tipado ou `null`.
 * Cópia por allowlist, nunca o objeto cru — campo extra do cache antigo
 * (como `script`) não atravessa.
 */

import type {
  CourseRequest,
  DownloadAllFilesPayload,
  DownloadFilePayload,
  LoginCredentials,
  NewsDetailRequest,
  SettingUpdate,
} from '../../shared/ipc';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CONTROL_PATTERN = /[\x00-\x1F\x7F]/;

/** Ids do SIGAA (idTurma, id de arquivo no jsfcljs, id de notícia): só [A-Za-z0-9_-], 1..64. */
export function parseId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (!ID_PATTERN.test(v)) return null;
  return v;
}

/** Texto de exibição/nome de arquivo: string 1..max, sem NUL nem controle. */
export function parseText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  if (v.length < 1 || v.length > max) return null;
  if (CONTROL_PATTERN.test(v)) return null;
  return v;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseLoginCredentials(v: unknown): LoginCredentials | null {
  if (!isRecord(v)) return null;
  const username = parseText(v['username'], 100);
  const password = parseText(v['password'], 200);
  if (username === null || password === null) return null;
  if ('rememberMe' in v && v['rememberMe'] !== undefined) {
    if (typeof v['rememberMe'] !== 'boolean') return null;
    return { username, password, rememberMe: v['rememberMe'] };
  }
  return { username, password };
}

export function parseCourseRequest(v: unknown): CourseRequest | null {
  if (!isRecord(v)) return null;
  const courseId = parseId(v['courseId']);
  const courseName = parseText(v['courseName'], 200);
  if (courseId === null || courseName === null) return null;
  return { courseId, courseName };
}

export function parseDownloadFilePayload(v: unknown): DownloadFilePayload | null {
  if (!isRecord(v)) return null;
  const courseId = parseId(v['courseId']);
  const courseName = parseText(v['courseName'], 200);
  const fileId = parseId(v['fileId']);
  const fileName = parseText(v['fileName'], 255);
  if (courseId === null || courseName === null || fileId === null || fileName === null) return null;
  return { courseId, courseName, fileId, fileName };
}

export function parseDownloadAllFilesPayload(v: unknown): DownloadAllFilesPayload | null {
  if (!isRecord(v)) return null;
  const courseId = parseId(v['courseId']);
  const courseName = parseText(v['courseName'], 200);
  if (courseId === null || courseName === null) return null;
  const rawFiles = v['files'];
  if (!Array.isArray(rawFiles) || rawFiles.length > 500) return null;
  const files: { id: string; name: string }[] = [];
  for (const item of rawFiles) {
    if (!isRecord(item)) return null;
    const id = parseId(item['id']);
    const name = parseText(item['name'], 255);
    if (id === null || name === null) return null;
    files.push({ id, name });
  }
  return { courseId, courseName, files };
}

export function parseNewsDetailRequest(v: unknown): NewsDetailRequest | null {
  if (!isRecord(v)) return null;
  const courseId = parseId(v['courseId']);
  const courseName = parseText(v['courseName'], 200);
  const newsId = parseId(v['newsId']);
  if (courseId === null || courseName === null || newsId === null) return null;
  return { courseId, courseName, newsId };
}

export function parseFilePaths(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length > 500) return null;
  const out: string[] = [];
  for (const item of v) {
    const text = parseText(item, 4096);
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

export function parseSettingUpdate(v: unknown): SettingUpdate | null {
  if (!isRecord(v)) return null;
  if (typeof v['key'] !== 'string') return null;
  if (!('value' in v)) return null;
  const key = v['key'];
  const value = v['value'];
  switch (key) {
    case 'theme':
      if (value === 'light' || value === 'dark') return { key: 'theme', value };
      return null;
    case 'runInBackground':
      if (typeof value === 'boolean') return { key: 'runInBackground', value };
      return null;
    case 'openAtLogin':
      if (typeof value === 'boolean') return { key: 'openAtLogin', value };
      return null;
    case 'autoDownloadUpdates':
      if (typeof value === 'boolean') return { key: 'autoDownloadUpdates', value };
      return null;
    case 'syncInterval':
      if (typeof value === 'number' && Number.isInteger(value) && value >= 15 && value <= 1440) {
        return { key: 'syncInterval', value };
      }
      return null;
    case 'lastDownloadPath':
      if (value === null) return { key: 'lastDownloadPath', value: null };
      return null;
    default:
      return null;
  }
}
