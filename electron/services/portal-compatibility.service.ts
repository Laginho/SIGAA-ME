/**
 * Kill-switch de compatibilidade (PORTAL-005): três ciclos consecutivos de
 * falha estrutural (`SELECTOR_DRIFT`) desligam sync em background e
 * auto-download até um `getCourseFiles` manual bem-sucedido restaurar o
 * estado. Estado próprio em `userData/compatibility.json`, nunca em
 * `settings.json` — não é uma preferência do usuário, é diagnóstico do main.
 */
import * as fs from 'fs';
import { errorMessage } from '../../shared/errors';
import type { CompatibilityStatus } from '../../shared/ipc';
import { logger } from './logger.service';

const log = logger.scope('PortalCompatibility');

export const STRUCTURAL_FAILURE_THRESHOLD = 3;

const OK_STATUS: CompatibilityStatus = { state: 'ok' };

function isValidStatus(value: unknown): value is CompatibilityStatus {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    if (record.state === 'ok') return true;
    return (
        record.state === 'incompatible' &&
        typeof record.since === 'number' &&
        typeof record.failures === 'number' &&
        record.lastCode === 'SELECTOR_DRIFT'
    );
}

export class PortalCompatibilityService {
    private cached: CompatibilityStatus | undefined;
    private consecutiveFailures = 0;

    constructor(
        private readonly filePath: string,
        private readonly onChange: (status: CompatibilityStatus) => void,
    ) {}

    /** Lê o arquivo uma vez, preguiçoso; ausente ou inválido é `ok`. */
    status(): CompatibilityStatus {
        if (this.cached === undefined) this.cached = this.readFromDisk();
        return this.cached;
    }

    /** Conta um ciclo com falha estrutural; no 3º consecutivo vira `incompatible` e chama `onChange`. Nunca lança. */
    recordStructuralFailure(code: 'SELECTOR_DRIFT'): void {
        this.consecutiveFailures++;
        if (this.consecutiveFailures < STRUCTURAL_FAILURE_THRESHOLD) return;

        const next: CompatibilityStatus = {
            state: 'incompatible',
            since: Date.now(),
            failures: this.consecutiveFailures,
            lastCode: code,
        };
        this.cached = next;
        this.persist(next);
        this.onChange(next);
    }

    /** Zera o contador; se estava `incompatible`, volta a `ok` e chama `onChange`. Nunca lança. */
    recordSuccess(): void {
        this.consecutiveFailures = 0;
        if (this.status().state !== 'incompatible') return;

        this.cached = OK_STATUS;
        this.persist(OK_STATUS);
        this.onChange(OK_STATUS);
    }

    /** Volta a `ok` e apaga o arquivo. Rejeita com o erro da exclusão. */
    async clear(): Promise<void> {
        this.consecutiveFailures = 0;
        this.cached = OK_STATUS;
        try {
            await fs.promises.unlink(this.filePath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
    }

    private readFromDisk(): CompatibilityStatus {
        try {
            if (!fs.existsSync(this.filePath)) return OK_STATUS;
            const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            return isValidStatus(parsed) ? parsed : OK_STATUS;
        } catch {
            return OK_STATUS;
        }
    }

    private persist(status: CompatibilityStatus): void {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(status));
        } catch (error) {
            // Decisão, não silêncio (regra 3 do CLAUDE.md): a falha de escrita não
            // pode derrubar o flip em memória, que é o que impede o login repetido.
            // O próximo flip tenta gravar de novo.
            log.error('Falha ao persistir estado de compatibilidade', { error: errorMessage(error) });
        }
    }
}
