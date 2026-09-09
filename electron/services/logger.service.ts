import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const MAX_BYTES = 1024 * 1024;
const MAX_ROTATIONS = 2;

/** Chaves cujo valor nunca deve chegar ao disco, independente do tipo. */
const SENSITIVE_KEYS = new Set([
    'password', 'senha', 'pass',
    'token', 'cookie', 'cookies',
    'authorization', 'auth', 'header', 'headers',
    'username', 'user', 'email', 'matricula',
    'path', 'filepath', 'dirpath',
    'coursename', 'filename',
    'script', 'viewstate',
]);

function normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z]/g, '');
}

/** Padrões que vazam segredo mesmo dentro de uma string livre, sem chave. */
const STRING_PATTERNS: Array<[RegExp, string]> = [
    [/\b(?:Cookie|Set-Cookie):\s*[^\n]+/gi, 'Cookie: [REDACTED]'],
    [/\bAuthorization:\s*[^\n]+/gi, 'Authorization: [REDACTED]'],
    [/\bBearer\s+[\w.-]+/gi, 'Bearer [REDACTED]'],
    [/javax\.faces\.ViewState[^\n]*/gi, '[REDACTED_VIEWSTATE]'],
    [/\bj_id\w*(?::\w+)+/gi, '[REDACTED_VIEWSTATE]'],
    [/[A-Za-z]:\\[^\s"']+/g, '[REDACTED_PATH]'],
    [/\/(?:home|Users|root)\/[^\s"']+/g, '[REDACTED_PATH]'],
    [/<!DOCTYPE[\s\S]*|<html[\s\S]*/gi, '[REDACTED_HTML]'],
];

function redactString(value: string): string {
    return STRING_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), value);
}

/** Redige recursivamente: chave sensível vira `[REDACTED]` inteira, string livre é filtrada por padrão. */
function redact(value: unknown): unknown {
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = SENSITIVE_KEYS.has(normalizeKey(key)) ? '[REDACTED]' : redact(val);
        }
        return result;
    }
    return value;
}

export interface ScopedLogger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

export class LoggerService {
    private resolvedLogPath: string | null = null;

    /**
     * Resolvido só no primeiro uso, não no construtor (DEV-002): o singleton
     * do módulo é criado no import, antes de `main.ts` decidir o `userData` de
     * dev — chamar `app.getPath` ali gravava sempre no caminho de produção.
     */
    private getLogFilePath(): string {
        if (!this.resolvedLogPath) {
            const userDataPath = app.getPath('userData');
            this.resolvedLogPath = path.join(userDataPath, 'sigaa-me.log');
            if (!fs.existsSync(this.resolvedLogPath)) {
                fs.writeFileSync(this.resolvedLogPath, '');
            }
        }
        return this.resolvedLogPath;
    }

    private rotationPaths(logPath: string): string[] {
        return Array.from({ length: MAX_ROTATIONS }, (_, i) => `${logPath}.${i + 1}`);
    }

    private rotateIfNeeded(logPath: string, incomingBytes: number) {
        let currentSize = 0;
        try {
            currentSize = fs.statSync(logPath).size;
        } catch {
            return;
        }
        if (currentSize + incomingBytes <= MAX_BYTES) return;

        const rotations = this.rotationPaths(logPath);
        for (let i = rotations.length - 1; i >= 0; i--) {
            const src = i === 0 ? logPath : rotations[i - 1];
            const dest = rotations[i];
            if (fs.existsSync(src)) fs.renameSync(src, dest);
        }
        fs.writeFileSync(logPath, '');
    }

    private formatMessage(level: string, message: string, ...args: unknown[]): string {
        const timestamp = new Date().toISOString();
        const redactedMessage = redactString(message);
        const argsStr = args.length ? ' ' + args.map(a => {
            const redacted = redact(a);
            return typeof redacted === 'object' ? JSON.stringify(redacted) : String(redacted);
        }).join(' ') : '';
        return `[${timestamp}] [${level}] ${redactedMessage}${argsStr}\n`;
    }

    private write(text: string) {
        try {
            const logPath = this.getLogFilePath();
            this.rotateIfNeeded(logPath, Buffer.byteLength(text));
            fs.appendFileSync(logPath, text);
        } catch (error) {
            // Nunca `this.error(...)` aqui: recairia em `write()` de novo e,
            // se a falha for persistente (disco cheio), recursaria sem fim.
            console.error('Failed to write to log file:', error);
        }
    }

    info(message: string, ...args: unknown[]) {
        this.write(this.formatMessage('INFO', message, ...args));
    }

    warn(message: string, ...args: unknown[]) {
        this.write(this.formatMessage('WARN', message, ...args));
    }

    error(message: string, ...args: unknown[]) {
        this.write(this.formatMessage('ERROR', message, ...args));
    }

    /** Logger com prefixo de componente e, opcionalmente, de operação. */
    scope(component: string, operationId?: string): ScopedLogger {
        const prefix = operationId ? `[${component}:${operationId}]` : `[${component}]`;
        return {
            info: (message, ...args) => this.info(`${prefix} ${message}`, ...args),
            warn: (message, ...args) => this.warn(`${prefix} ${message}`, ...args),
            error: (message, ...args) => this.error(`${prefix} ${message}`, ...args),
        };
    }

    getLogPath(): string {
        return this.getLogFilePath();
    }

    /**
     * Propaga a falha (DATA-002, achado da revisão). O único chamador é o
     * handler `clear-all-data`, e o critério de aceite dele é "exclusão parcial
     * devolve erro de armazenamento": engolir aqui fazia o app dizer "dados
     * removidos" com `sigaa-me.log` intacto no disco.
     */
    clear() {
        const logPath = this.getLogFilePath();
        fs.writeFileSync(logPath, '');
        for (const rotated of this.rotationPaths(logPath)) {
            fs.rmSync(rotated, { force: true });
        }
    }
}

export const logger = new LoggerService();
