import { createHash } from 'node:crypto';
import type { AccountId } from '../../shared/domain';

/**
 * Identidade de conta do main (DATA-001).
 *
 * Duas coisas, só: derivar o id a partir do login e lembrar de quem é a sessão
 * atual. Não há listener nem evento — os três consumidores (`SigaaService`,
 * `BackgroundSyncService`, `simulateNewFile` no `main.ts`) leem quando
 * precisam.
 */

/**
 * `sha256(username.trim().toLowerCase())` em hex minúsculo.
 *
 * Sem salt de propósito: um salt guardado ao lado do dado não protege contra
 * quem já lê o disco, e o id precisa ser reproduzível entre instalações para
 * que a conta A reencontre o cache dela. O que ele garante é que a matrícula
 * não atravessa o IPC nem vai para o `localStorage` do renderer.
 *
 * Username vazio lança: hash de string vazia seria um id válido compartilhado
 * por todo login quebrado.
 */
export function deriveAccountId(username: string): AccountId {
    const normalized = username.trim().toLowerCase();
    if (!normalized) {
        throw new Error('Não é possível derivar uma identidade de conta a partir de um usuário vazio.');
    }
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

let activeAccount: AccountId | null = null;

/** Conta da sessão atual do main, ou `null` quando ninguém está logado. */
export function getActiveAccount(): AccountId | null {
    return activeAccount;
}

/** Definido só por `SigaaService.login` (sucesso) e limpo por `SigaaService.logout`. */
export function setActiveAccount(accountId: AccountId | null): void {
    activeAccount = accountId;
}
