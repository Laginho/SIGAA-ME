/**
 * O único módulo do renderer que toca Web Storage (DATA-001).
 *
 * Conta ativa da janela em `sessionStorage`, dados da conta em `localStorage`
 * sob `sigaa-me:v2:<accountId>:<nome>`. Toda página e todo util passam por
 * aqui — `tests/unit/account-storage.test.ts` lê `src/**` como texto e falha
 * se alguém voltar a chamar storage direto (comentários contam).
 *
 * Entra e sai `string`, como o `localStorage`: quem chama continua dono do
 * seu `JSON.parse` e do seu `try/catch`.
 */
import type { AccountId, AccountProfile } from '../../shared/domain';

export const SESSION_ACCOUNT_KEY = 'sigaa-me:v2:session:account';

export type AccountStorageKey =
    | 'courses'
    | 'downloads'
    | 'notifications'
    | 'read-items'
    | 'photo'
    | 'sync-timestamp';

/**
 * As chaves sem escopo que o app usava antes desta tarefa. Não dá para saber
 * de quem elas são, então são apagadas — nunca migradas.
 */
export const LEGACY_KEYS: readonly string[] = [
    'coursesWithFiles',
    'cacheTimestamp',
    'downloadedFiles',
    'readItems',
    'notificationsHistory',
    'userPhotoUrl',
];

/** Mesmo padrão de id do IPC (SEC-002); o hex do sha-256 cabe nele. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function accountKey(accountId: AccountId, name: AccountStorageKey): string {
    return `sigaa-me:v2:${accountId}:${name}`;
}

function toProfile(value: unknown): AccountProfile | null {
    if (typeof value !== 'object' || value === null) return null;
    const { id, name, photoUrl } = value as { id?: unknown; name?: unknown; photoUrl?: unknown };
    if (typeof id !== 'string' || !SAFE_ID.test(id)) return null;
    if (typeof name !== 'string') return null;
    // Cópia por allowlist: um perfil guardado por uma versão antiga (ou
    // adulterado) não empurra campos extras para dentro do app.
    return typeof photoUrl === 'string' ? { id, name, photoUrl } : { id, name };
}

/**
 * Torna `profile` a conta ativa desta janela e apaga o que ficou sem escopo:
 * é exatamente o momento "outra pessoa logou" do critério de aceite.
 */
export function setActiveAccount(profile: AccountProfile): void {
    const valid = toProfile(profile);
    if (!valid) {
        throw new Error('Perfil de conta inválido: id precisa casar com /^[A-Za-z0-9_-]{1,64}$/ e name precisa ser string.');
    }
    sessionStorage.setItem(SESSION_ACCOUNT_KEY, JSON.stringify(valid));
    purgeLegacyStorage();
}

/** `null` quando não há sessão, o valor guardado é ilegível, ou o perfil não valida. */
export function getActiveAccount(): AccountProfile | null {
    const raw = sessionStorage.getItem(SESSION_ACCOUNT_KEY);
    if (!raw) return null;
    try {
        return toProfile(JSON.parse(raw));
    } catch {
        return null;
    }
}

/** Sai da sessão sem tocar nos dados da conta — o próximo login dela reencontra tudo. */
export function clearActiveAccount(): void {
    sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
}

export function readAccountItem(name: AccountStorageKey): string | null {
    const account = getActiveAccount();
    return account ? localStorage.getItem(accountKey(account.id, name)) : null;
}

/**
 * Lança sem conta ativa. Escrever "em algum lugar" é o bug que esta tarefa
 * fecha: sem dono, o dado seria visível para a próxima pessoa a logar.
 */
export function writeAccountItem(name: AccountStorageKey, value: string): void {
    const account = getActiveAccount();
    if (!account) {
        throw new Error(`Sem conta ativa: não há onde gravar "${name}".`);
    }
    localStorage.setItem(accountKey(account.id, name), value);
}

export function removeAccountItem(name: AccountStorageKey): void {
    const account = getActiveAccount();
    if (account) localStorage.removeItem(accountKey(account.id, name));
}

export function purgeLegacyStorage(): void {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

/** O botão 🗑️ do dashboard: apaga tudo de todas as contas nesta máquina. */
export function clearAllLocalData(): void {
    localStorage.clear();
    sessionStorage.clear();
}
