import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogMeta = Record<string, unknown>;

export interface ScopedLogger {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

export interface LoggerOptions {
    /** Raiz do `userData`. Lida no primeiro write, nunca no construtor. */
    userDataPath: () => string;
    /** `app.isPackaged`. Decide redação de conteúdo, `stack` e eco no console. */
    production: () => boolean;
    maxFileBytes?: number;    // default 1 MiB
    maxFiles?: number;        // default 5
}

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const MAX_LINE_CHARS = 4096;

// ── Redação, camada (a): sempre, em todo modo ───────────────────────────────

const PASSWORD_RE = /\b(password|senha|passwd|pwd)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi;
const COOKIE_HEADER_RE = /\b(set-cookie|cookie)(\s*:\s*)[^\r\n]*/gi;
const SESSION_PAIR_RE = /\b(\w*session\w*)=[^\r\n]*/gi;
const AUTH_RE = /\bAuthorization(\s*[:=]\s*)[^\r\n]*/gi;
const VIEWSTATE_RE = /\b(javax\.faces\.ViewState)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&"']+)/gi;
const HTML_RE = /<[a-zA-Z!][\s\S]*$/;
const WIN_PATH_RE = /[A-Za-z]:\\[^\s"'<>|]*/g;
const UNC_PATH_RE = /\\\\[^\s"'<>|]+/g;
const POSIX_PATH_RE = /(?:\/home|\/Users|\/tmp|\/var|\/root|\/opt|\/mnt)(?:\/[^\s"'<>|]*)?/g;

/**
 * Sempre redige, em todo modo: senha, cookie, header de auth, ViewState,
 * script JSF, HTML e caminho absoluto. Corta em `MAX_LINE_CHARS`.
 */
export function redact(text: string): string {
    let out = text;
    out = out.replace(PASSWORD_RE, (_m, key: string, sep: string) => `${key}${sep}[redacted]`);
    out = out.replace(COOKIE_HEADER_RE, (_m, key: string, sep: string) => `${key}${sep}[redacted]`);
    out = out.replace(SESSION_PAIR_RE, (_m, key: string) => `${key}=[redacted]`);
    out = out.replace(AUTH_RE, (_m, sep: string) => `Authorization${sep}[redacted]`);
    out = out.replace(VIEWSTATE_RE, (_m, key: string, sep: string) => `${key}${sep}[redacted]`);
    out = redactJsf(out);
    out = out.replace(HTML_RE, '[html omitted]');
    out = out.replace(WIN_PATH_RE, '[path]');
    out = out.replace(UNC_PATH_RE, '[path]');
    out = out.replace(POSIX_PATH_RE, '[path]');
    if (out.length > MAX_LINE_CHARS) {
        out = `${out.slice(0, MAX_LINE_CHARS)} [truncated]`;
    }
    return out;
}

/** `jsfcljs(...)` pode ter parênteses aninhados; regex não casa isso, então varre. */
function redactJsf(text: string): string {
    const marker = 'jsfcljs(';
    let result = '';
    let i = 0;
    for (;;) {
        const idx = text.indexOf(marker, i);
        if (idx === -1) {
            result += text.slice(i);
            return result;
        }
        result += text.slice(i, idx);
        let depth = 1;
        let j = idx + marker.length;
        while (j < text.length && depth > 0) {
            if (text[j] === '(') depth++;
            else if (text[j] === ')') depth--;
            j++;
        }
        result += '[jsf]';
        i = j;
    }
}

// ── Redação, camada (b): por chave do `meta`, recursiva (profundidade ≤ 4) ──

const SECRET_KEYS = new Set([
    'password', 'senha', 'passwd', 'pwd', 'cookie', 'cookies', 'header', 'headers',
    'authorization', 'viewstate', 'token',
]);
const CONTENT_KEYS = new Set([
    'name', 'username', 'user', 'filename', 'coursename', 'title', 'path', 'filepath',
    'basepath', 'dir', 'html', 'body', 'script', 'onclick', 'href', 'url',
]);
const MAX_META_DEPTH = 4;

function sanitizeError(err: Error, production: boolean): Record<string, unknown> {
    const out: Record<string, unknown> = {
        name: err.name,
        message: redact(err.message),
        code: (err as NodeJS.ErrnoException).code,
    };
    if (!production && err.stack) out.stack = redact(err.stack);
    return out;
}

function sanitizeMeta(value: unknown, production: boolean, depth = 0): unknown {
    if (value instanceof Error) return sanitizeError(value, production);
    if (depth >= MAX_META_DEPTH) return '[depth omitted]';
    if (Array.isArray(value)) return value.map((v) => sanitizeMeta(v, production, depth + 1));
    if (value !== null && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
            const lower = key.toLowerCase();
            if (SECRET_KEYS.has(lower)) out[key] = '[redacted]';
            else if (CONTENT_KEYS.has(lower)) out[key] = production ? '[redacted]' : v;
            else out[key] = sanitizeMeta(v, production, depth + 1);
        }
        return out;
    }
    return value;
}

// ── LoggerService ────────────────────────────────────────────────────────

export class LoggerService implements ScopedLogger {
    private readonly userDataPath: () => string;
    private readonly production: () => boolean;
    private readonly maxFileBytes: number;
    private readonly maxFiles: number;
    private dir = '';
    private filePath = '';
    private stream: fs.WriteStream | null = null;
    private bytes = 0;
    private initialized = false;
    private sinkDisabled = false;
    private chain: Promise<void> = Promise.resolve();

    constructor(options: LoggerOptions) {
        this.userDataPath = options.userDataPath;
        this.production = options.production;
        this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
        this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    }

    scope(component: string): ScopedLogger {
        return {
            info: (message, ...args) => this.enqueue('INFO', component, message, args),
            warn: (message, ...args) => this.enqueue('WARN', component, message, args),
            error: (message, ...args) => this.enqueue('ERROR', component, message, args),
        };
    }

    info(message: string, ...args: unknown[]): void {
        this.enqueue('INFO', 'main', message, args);
    }

    warn(message: string, ...args: unknown[]): void {
        this.enqueue('WARN', 'main', message, args);
    }

    error(message: string, ...args: unknown[]): void {
        this.enqueue('ERROR', 'main', message, args);
    }

    /** Resolve com tudo no disco. Nunca rejeita. */
    flush(): Promise<void> {
        return this.chain;
    }

    /** flush + fecha + apaga `logs/` via `fs.promises` + reabre no próximo write. Rejeita com o erro da exclusão. */
    async clear(): Promise<void> {
        await this.flush();
        const stream = this.stream;
        this.stream = null;
        if (stream) {
            await new Promise<void>((resolve) => stream.end(() => resolve()));
        }
        // Sem `initialized` o `this.dir` está vazio: recalcular o caminho faz um
        // `clear()` antes do primeiro write apagar o log do boot anterior, em vez
        // de resolver com o arquivo intacto (DATA-002).
        const dir = this.initialized ? this.dir : path.join(this.userDataPath(), 'logs');
        try {
            await fs.promises.rm(dir, { recursive: true, force: true });
        } finally {
            this.initialized = false;
            this.bytes = 0;
            this.sinkDisabled = false;
        }
    }

    private enqueue(level: 'INFO' | 'WARN' | 'ERROR', scope: string, message: string, args: unknown[]): void {
        if (this.sinkDisabled) return;
        const line = this.formatLine(level, scope, message, args);
        if (!this.production()) this.echo(level, line);
        this.chain = this.chain.then(() => this.writeLine(line)).catch((err) => this.onSinkFailure(err));
    }

    private formatArg(arg: unknown): string {
        const production = this.production();
        if (arg instanceof Error || (arg !== null && typeof arg === 'object')) {
            return redact(JSON.stringify(sanitizeMeta(arg, production)));
        }
        return redact(String(arg));
    }

    private formatLine(level: 'INFO' | 'WARN' | 'ERROR', scope: string, message: string, args: unknown[]): string {
        const ts = new Date().toISOString();
        const metaPart = args.length ? ` ${args.map((a) => this.formatArg(a)).join(' ')}` : '';
        // A quebra de linha entra depois do `redact`: o corte em MAX_LINE_CHARS
        // comeria o `\n` e colaria o registro seguinte na mesma linha.
        const line = `${ts} ${level} [${scope}] ${redact(message)}${metaPart}`;
        return `${redact(line)}\n`;
    }

    private echo(level: 'INFO' | 'WARN' | 'ERROR', line: string): void {
        const trimmed = line.trimEnd();
        if (level === 'ERROR') console.error(trimmed);
        else if (level === 'WARN') console.warn(trimmed);
        else console.log(trimmed);
    }

    private onSinkFailure(err: unknown): void {
        if (this.sinkDisabled) return;
        this.sinkDisabled = true;
        // Único `console` permitido: reportar a falha do próprio logger não pode
        // chamar o logger de novo (regra 3 do CLAUDE.md aplicada a si mesmo).
        console.error('[Logger] falha ao gravar log, sink desligado:', err);
    }

    private ensureInit(): void {
        if (this.initialized) return;
        this.dir = path.join(this.userDataPath(), 'logs');
        this.filePath = path.join(this.dir, 'app.log');
        fs.mkdirSync(this.dir, { recursive: true });
        this.bytes = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;
        this.openStream();
        this.initialized = true;
    }

    private openStream(): void {
        this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
        // Evita que um 'error' sem listener derrube o processo; a falha real é
        // tratada pelo callback do `write()` em `writeLine`.
        this.stream.on('error', () => undefined);
    }

    private rotatedPath(i: number): string {
        return i === 0 ? this.filePath : path.join(this.dir, `app.${i}.log`);
    }

    private rotate(): Promise<void> {
        return new Promise<void>((resolve) => {
            const finish = () => {
                const { maxFiles } = this;
                for (let i = maxFiles - 1; i >= 1; i--) {
                    const from = this.rotatedPath(i - 1);
                    const to = this.rotatedPath(i);
                    if (!fs.existsSync(from)) continue;
                    if (fs.existsSync(to)) fs.unlinkSync(to);
                    fs.renameSync(from, to);
                }
                this.openStream();
                this.bytes = 0;
                resolve();
            };
            if (this.stream) this.stream.end(finish);
            else finish();
        });
    }

    private async writeLine(line: string): Promise<void> {
        this.ensureInit();
        const bytes = Buffer.byteLength(line, 'utf8');
        if (this.bytes > 0 && this.bytes + bytes > this.maxFileBytes) {
            await this.rotate();
        }
        await new Promise<void>((resolve, reject) => {
            this.stream!.write(line, (err) => { if (err) reject(err); else resolve(); });
        });
        this.bytes += bytes;
    }
}

export const logger = new LoggerService({
    userDataPath: () => app.getPath('userData'),
    production: () => app.isPackaged,
});
