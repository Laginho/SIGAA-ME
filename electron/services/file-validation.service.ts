// DL-002: validação de arquivo compartilhada entre o caminho HTTP
// (http-scraper.service.ts) e o caminho Playwright (download.service.ts). Sem
// isto, a tabela de assinaturas e a detecção de HTML viviam duplicadas nos
// dois lugares — e desalinhar as duas cópias já quebrou este repositório
// antes (ver QA-005/BUG-007 no CLAUDE.md).
import * as fs from 'fs';
import * as path from 'path';
import mime from 'mime-types';
import { sanitizeSegment, isInsideRoot } from './download-path';

// ponytail: 500 MiB cobre o maior material legítimo visto num portal de
// disciplina (vídeo de aula, pacote zipado). Sobe por review se uma
// disciplina precisar de mais; não vira config por instância.
export const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;

const HEAD_SIZE = 4096;

// Fonte única de assinaturas: usada tanto para nomear (resolveFileName)
// quanto para verificar (validateHead). Duas tabelas que precisam concordar
// é o padrão que já quebrou este repositório (BUG-001, BUG-007).
const SIGNATURES: Record<string, string[]> = {
    '.pdf': ['25504446'],
    '.zip': ['504B0304', '504B0506', '504B0708'],
    '.docx': ['504B0304', '504B0506', '504B0708'],
    '.xlsx': ['504B0304', '504B0506', '504B0708'],
    '.pptx': ['504B0304', '504B0506', '504B0708'],
    '.odt': ['504B0304', '504B0506', '504B0708'],
    '.ods': ['504B0304', '504B0506', '504B0708'],
    '.odp': ['504B0304', '504B0506', '504B0708'],
    '.doc': ['D0CF11E0A1B11AE1'],
    '.xls': ['D0CF11E0A1B11AE1'],
    '.ppt': ['D0CF11E0A1B11AE1'],
    '.png': ['89504E47'],
    '.jpg': ['FFD8FF'],
    '.jpeg': ['FFD8FF'],
    '.gif': ['47494638'],
    '.rar': ['52617221'],
    '.7z': ['377ABCAF271C'],
    '.gz': ['1F8B'],
};

// Ordem de tentativa ao deduzir a extensão a partir do conteúdo, sem dica
// nenhuma. `.zip` por último de propósito: docx/xlsx/pptx/odt/ods/odp
// compartilham a assinatura PK, então sem Content-Disposition não há como
// distingui-los, e `.zip` é a resposta honesta em vez de um chute.
const DETECT_ORDER = ['.pdf', '.png', '.jpg', '.gif', '.rar', '.7z', '.gz', '.zip'];

function sigMatches(headHex: string, sig: string): boolean {
    return headHex.length >= sig.length ? headHex.startsWith(sig) : sig.startsWith(headHex);
}

/**
 * Nomear exige a assinatura INTEIRA, não um prefixo: uma resposta vazia ou
 * truncada casa o prefixo de qualquer assinatura e sairia daqui batizada
 * `.pdf` — o mesmo chute que o BUG-001 arrancou. `validateHead` continua
 * aceitando prefixo, que lá é o lado seguro: não rejeitar arquivo curto legítimo.
 */
function extensionFromSignature(head: Buffer): string {
    const hex = head.toString('hex').toUpperCase();
    for (const ext of DETECT_ORDER) {
        if (SIGNATURES[ext].some(sig => hex.length >= sig.length && hex.startsWith(sig))) return ext;
    }
    return '';
}

/** `.7z` e `.docx` contam; `.5` (sem letra) e string vazia não. */
function isValidExt(ext: string): boolean {
    return /^\.[a-z0-9]{1,10}$/i.test(ext) && /[a-z]/i.test(ext);
}

/**
 * HTML = depois de BOM e espaços/quebras de linha opcionais, e de um prólogo
 * `<?xml ... ?>` opcional, o texto começa com `<!doctype` ou `<html`.
 */
function isHtml(head: Buffer): boolean {
    let text = head.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.replace(/^\s+/, '');

    const prolog = text.match(/^<\?xml[^>]*\?>/i);
    if (prolog) text = text.slice(prolog[0].length).replace(/^\s+/, '');

    const start = text.slice(0, 15).toLowerCase();
    return start.startsWith('<!doctype') || start.startsWith('<html');
}

/** Primeiros bytes do arquivo, o suficiente para toda assinatura da tabela e para farejar HTML. */
async function readHead(filePath: string): Promise<Buffer> {
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(HEAD_SIZE);
        const { bytesRead } = await handle.read(buffer, 0, HEAD_SIZE, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
}

async function mentionsExpiry(filePath: string): Promise<boolean> {
    const buffer = Buffer.alloc(64 * 1024);
    const handle = await fs.promises.open(filePath, 'r');
    try {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const text = buffer.toString('utf8', 0, bytesRead);
        return text.includes('ViewExpiredException') || /expira/i.test(text);
    } finally {
        await handle.close();
    }
}

/** Nome sugerido pelo servidor, ou `undefined`. Aceita `filename=`, `filename="..."` e `filename*=UTF-8''...` (percent-decoded). */
export function fileNameFromContentDisposition(header: string | undefined): string | undefined {
    if (!header) return undefined;

    const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (star) return decodeURIComponent(star[1].trim());

    const quoted = header.match(/filename\s*=\s*"([^"]*)"/i);
    if (quoted) return quoted[1];

    const bare = header.match(/filename\s*=\s*([^;]+)/i);
    if (bare) return bare[1].trim();

    return undefined;
}

/**
 * Nome final do arquivo, com extensão acrescentada só quando `fileName` não tem uma.
 * Ordem: extensão existente → `hintFileName` → MIME → assinatura.
 */
export function resolveFileName(input: { fileName: string; hintFileName?: string; contentType?: string; head: Buffer }): string {
    const { fileName, hintFileName, contentType, head } = input;

    if (isValidExt(path.extname(fileName))) return fileName;

    const hintExt = hintFileName ? path.extname(hintFileName).toLowerCase() : '';
    if (isValidExt(hintExt) && hintExt !== '.html' && hintExt !== '.htm') {
        return fileName + hintExt;
    }

    if (contentType) {
        const base = contentType.split(';')[0].trim().toLowerCase();
        if (base && base !== 'application/octet-stream' && base !== 'text/html') {
            const mimeExt = mime.extension(base);
            if (mimeExt && mimeExt !== 'bin') {
                return fileName + '.' + mimeExt.toLowerCase();
            }
        }
    }

    const sigExt = extensionFromSignature(head);
    return sigExt ? fileName + sigExt : fileName;
}

/**
 * `ext` com assinatura conhecida e bytes incompatíveis → `signature-mismatch`.
 * Conteúdo HTML → `html`, qualquer que seja `ext`. Extensão sem assinatura
 * registrada passa; `head` menor que a assinatura passa se for prefixo.
 */
export function validateHead(head: Buffer, ext: string): { ok: true } | { ok: false; reason: 'html' | 'signature-mismatch' } {
    if (isHtml(head)) return { ok: false, reason: 'html' };

    const sigs = SIGNATURES[ext.toLowerCase()];
    if (sigs) {
        const hex = head.toString('hex').toUpperCase();
        if (!sigs.some(sig => sigMatches(hex, sig))) {
            return { ok: false, reason: 'signature-mismatch' };
        }
    }

    return { ok: true };
}

/**
 * Fecha um download: lê a cabeça de `partPath`, resolve o nome, valida, e
 * renomeia para `dir/<nome>`. Em qualquer falha o `.part` é removido.
 */
export async function finalizeDownload(input: {
    partPath: string;
    dir: string;
    fileName: string;
    hintFileName?: string;
    contentType?: string;
}): Promise<
    | { ok: true; filePath: string }
    | { ok: false; reason: 'html' | 'session-expired' | 'signature-mismatch' | 'too-large'; error: string }
> {
    const { partPath, dir, hintFileName, contentType } = input;

    const cleanup = async () => {
        await fs.promises.unlink(partPath).catch(() => { });
    };

    try {
        // Nome vindo da UI/SIGAA: sanitizado antes de qualquer outra decisão,
        // para que um nome inválido (ex.: "..") lance aqui e nunca chegue a
        // ganhar uma extensão que o disfarçaria como válido.
        const safeName = sanitizeSegment(input.fileName, 150);

        const stats = await fs.promises.stat(partPath);
        if (stats.size > MAX_DOWNLOAD_BYTES) {
            await cleanup();
            return { ok: false, reason: 'too-large', error: `Arquivo (${stats.size} bytes) excede o limite de ${MAX_DOWNLOAD_BYTES} bytes` };
        }

        const head = await readHead(partPath);
        const resolvedName = resolveFileName({ fileName: safeName, hintFileName, contentType, head });
        const ext = path.extname(resolvedName).toLowerCase();

        const check = validateHead(head, ext);
        if (!check.ok) {
            const expired = check.reason === 'html' && await mentionsExpiry(partPath);
            await cleanup();
            if (expired) {
                return { ok: false, reason: 'session-expired', error: 'Sessão do SIGAA expirada' };
            }
            return {
                ok: false,
                reason: check.reason,
                error: check.reason === 'html'
                    ? 'O servidor retornou uma página HTML em vez do arquivo esperado'
                    : `Assinatura do conteúdo não corresponde à extensão ${ext}`
            };
        }

        const filePath = path.join(dir, resolvedName);
        if (!isInsideRoot(dir, filePath)) {
            throw new Error('Nome de arquivo/pasta inválido');
        }

        await fs.promises.rename(partPath, filePath);
        return { ok: true, filePath };
    } catch (err) {
        await cleanup();
        throw err;
    }
}
