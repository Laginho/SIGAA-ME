import * as fs from 'fs';
import * as path from 'path';

const INVALID_CHARS_RE = /[<>:"/\\|?*\x00-\x1F]/g;
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * Um componente de caminho seguro a partir de texto do SIGAA. Lança em nome vazio.
 */
export function sanitizeSegment(raw: string, maxLength: number): string {
  // troca [<>:"/\\|?*\x00-\x1F] por _
  let sanitized = raw.replace(INVALID_CHARS_RE, '_');

  // trim() e remove pontos e espaços finais (Windows os descarta silenciosamente)
  sanitized = sanitized.trim().replace(/[. ]+$/g, '');

  // um segmento que ficou vazio, ou só de pontos (., .., ...), lança
  if (!sanitized || /^\.+$/.test(sanitized)) {
    throw new Error('Nome de arquivo/pasta inválido');
  }

  // nome reservado do Windows, insensível a caixa e ignorando extensão
  const extForReserved = path.extname(sanitized);
  const nameWithoutExt = extForReserved ? sanitized.slice(0, -extForReserved.length) : sanitized;
  if (RESERVED_NAMES.has(nameWithoutExt.toUpperCase())) {
    sanitized = '_' + sanitized;
  }

  // prefixa se começar com ponto para evitar `.._...` ser interpretado como travessia-like
  // (necessário para passar `not.toMatch(/^\.\./)` em download-path-security.test.ts)
  // Não afeta nomes normais; `.`/`..` já teriam lançado acima.
  if (sanitized.startsWith('.')) {
    sanitized = '_' + sanitized;
  }

  // corta em maxLength preservando a extensão (no máximo 16 chars de extensão)
  if (sanitized.length > maxLength) {
    const finalExt = path.extname(sanitized);
    const extKeep = finalExt.length > 16 ? finalExt.slice(0, 16) : finalExt;
    const base = finalExt ? sanitized.slice(0, sanitized.length - finalExt.length) : sanitized;
    const maxBase = maxLength - extKeep.length;
    sanitized = base.slice(0, maxBase) + extKeep;
  }

  return sanitized;
}

/** `true` se `candidate` (resolvido) está dentro de `root` (resolvido). Só `path`, sem fs. */
export function isInsideRoot(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return true;
}

/** `root/<turma>/<arquivo>` sanitizado e provado dentro de `root`. Lança se escapar. */
export function resolveDownloadTarget(root: string, courseName: string, fileName: string): { dir: string; fullPath: string } {
  const dir = path.join(root, sanitizeSegment(courseName, 100));
  const fullPath = path.join(dir, sanitizeSegment(fileName, 150));
  const rel = path.relative(path.resolve(root), path.resolve(fullPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Nome de arquivo/pasta inválido');
  }
  return { dir, fullPath };
}

/** mkdir -p de `dir` e prova por `fs.realpathSync` que ele continua dentro de `root` (symlink/junction). Lança se não. */
export function ensureDirInsideRoot(root: string, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const rel = path.relative(fs.realpathSync(root), fs.realpathSync(dir));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Pasta fora da raiz de downloads');
  }
}
