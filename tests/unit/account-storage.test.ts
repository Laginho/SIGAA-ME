// @vitest-environment jsdom
/**
 * DATA-001 — `src/data/account-storage.ts`: o único módulo do renderer que
 * toca `localStorage`/`sessionStorage`.
 *
 * Vermelho hoje pelo motivo certo: o módulo não existe. O último teste lê
 * `src/**` como texto e continua vermelho enquanto qualquer página ou util
 * chamar storage direto — é a garantia de "nenhuma chave crua e sem escopo".
 *
 * Conta ativa em `sessionStorage` (chave `sigaa-me:v2:session:account`),
 * dados da conta em `localStorage` sob `sigaa-me:v2:<accountId>:<nome>`.
 * `setActiveAccount` apaga as chaves legadas sem escopo: elas não podem ser
 * atribuídas a ninguém, e a próxima pessoa a logar não pode vê-las.
 *
 * Contrato e decisões: `.scratch/04-fase3-fronteiras-de-confianca/issues/05-DATA-001-*.md`.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    accountKey,
    clearActiveAccount,
    getActiveAccount,
    LEGACY_KEYS,
    purgeLegacyStorage,
    readAccountItem,
    removeAccountItem,
    SESSION_ACCOUNT_KEY,
    setActiveAccount,
    writeAccountItem,
} from '../../src/data/account-storage';

const A = { id: 'acc-a', name: 'ALUNO A', photoUrl: 'https://si3.ufc.br/foto/a.jpg' };
const B = { id: 'acc-b', name: 'ALUNO B' };

describe('account-storage: keys', () => {
    it('namespaces every account item under sigaa-me:v2:<accountId>:<name>', () => {
        expect(accountKey('abc', 'courses')).toBe('sigaa-me:v2:abc:courses');
        expect(accountKey('abc', 'downloads')).toBe('sigaa-me:v2:abc:downloads');
        expect(accountKey('abc', 'notifications')).toBe('sigaa-me:v2:abc:notifications');
        expect(accountKey('abc', 'read-items')).toBe('sigaa-me:v2:abc:read-items');
        expect(accountKey('abc', 'photo')).toBe('sigaa-me:v2:abc:photo');
        expect(accountKey('abc', 'sync-timestamp')).toBe('sigaa-me:v2:abc:sync-timestamp');
    });

    it('lists exactly the unscoped keys the app used before DATA-001', () => {
        expect([...LEGACY_KEYS].sort()).toEqual([
            'cacheTimestamp',
            'coursesWithFiles',
            'downloadedFiles',
            'notificationsHistory',
            'readItems',
            'userPhotoUrl',
        ]);
        expect(SESSION_ACCOUNT_KEY).toBe('sigaa-me:v2:session:account');
    });
});

describe('account-storage: active account', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('stores the profile in sessionStorage and reads it back', () => {
        setActiveAccount(A);

        expect(getActiveAccount()).toEqual(A);
        expect(sessionStorage.getItem(SESSION_ACCOUNT_KEY)).not.toBeNull();
        expect(sessionStorage.getItem('account')).toBeNull();
    });

    it('ignores the legacy sessionStorage.account entry', () => {
        sessionStorage.setItem('account', JSON.stringify(A));

        expect(getActiveAccount()).toBeNull();
    });

    it('returns null for a malformed stored profile instead of trusting it', () => {
        for (const bad of ['{not-json', JSON.stringify({ name: 'sem id' }), JSON.stringify({ id: 'com espaço', name: 'x' }), JSON.stringify({ id: 'a:b', name: 'x' }), JSON.stringify({ id: 'ok', name: 42 })]) {
            sessionStorage.setItem(SESSION_ACCOUNT_KEY, bad);
            expect(getActiveAccount()).toBeNull();
        }
    });

    it('rejects a profile whose id is not a safe identifier', () => {
        expect(() => setActiveAccount({ id: '', name: 'x' })).toThrow();
        expect(() => setActiveAccount({ id: 'a:b', name: 'x' })).toThrow();
        expect(() => setActiveAccount({ id: 'x'.repeat(65), name: 'x' })).toThrow();
        expect(getActiveAccount()).toBeNull();
    });

    it('clearActiveAccount forgets the session but leaves the namespaced data on disk', () => {
        setActiveAccount(A);
        writeAccountItem('courses', '[]');

        clearActiveAccount();

        expect(getActiveAccount()).toBeNull();
        expect(localStorage.getItem(accountKey(A.id, 'courses'))).toBe('[]');
    });
});

describe('account-storage: items are scoped to the active account', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('writes and reads under the active account key', () => {
        setActiveAccount(A);

        writeAccountItem('courses', '[{"id":"c1"}]');

        expect(localStorage.getItem(accountKey(A.id, 'courses'))).toBe('[{"id":"c1"}]');
        expect(readAccountItem('courses')).toBe('[{"id":"c1"}]');
        removeAccountItem('courses');
        expect(readAccountItem('courses')).toBeNull();
    });

    it('reads null and refuses to write when there is no active account', () => {
        expect(readAccountItem('courses')).toBeNull();
        expect(() => writeAccountItem('courses', '[]')).toThrow();
        expect(localStorage.length).toBe(0);
    });

    it('switching accounts switches the data, and nothing crosses over', () => {
        setActiveAccount(A);
        writeAccountItem('courses', '["A"]');
        writeAccountItem('photo', A.photoUrl);

        setActiveAccount(B);
        expect(readAccountItem('courses')).toBeNull();
        expect(readAccountItem('photo')).toBeNull();
        writeAccountItem('courses', '["B"]');

        setActiveAccount(A);
        expect(readAccountItem('courses')).toBe('["A"]');
        expect(readAccountItem('photo')).toBe(A.photoUrl);
    });
});

describe('account-storage: legacy unscoped data', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    function plantLegacy() {
        localStorage.setItem('coursesWithFiles', '[{"id":"legacy"}]');
        localStorage.setItem('cacheTimestamp', '1');
        localStorage.setItem('downloadedFiles', '{}');
        localStorage.setItem('readItems', '[]');
        localStorage.setItem('notificationsHistory', '[]');
        localStorage.setItem('userPhotoUrl', 'https://si3.ufc.br/foto/legacy.jpg');
    }

    it('purgeLegacyStorage removes every legacy key and nothing else', () => {
        setActiveAccount(A);
        writeAccountItem('courses', '["A"]');
        plantLegacy();

        purgeLegacyStorage();

        for (const key of LEGACY_KEYS) expect(localStorage.getItem(key)).toBeNull();
        expect(readAccountItem('courses')).toBe('["A"]');
    });

    it('setActiveAccount purges legacy keys, so the next person to log in never sees them', () => {
        plantLegacy();

        setActiveAccount(B);

        for (const key of LEGACY_KEYS) expect(localStorage.getItem(key)).toBeNull();
        expect(readAccountItem('courses')).toBeNull();
        expect(readAccountItem('photo')).toBeNull();
    });
});

describe('account-storage is the only renderer module that touches Web Storage', () => {
    const root = process.cwd();
    const ALLOWED = path.join(root, 'src', 'data', 'account-storage.ts');

    function collectSourceFiles(dir: string): string[] {
        return readdirSync(dir).flatMap(entry => {
            const full = path.join(dir, entry);
            if (statSync(full).isDirectory()) return collectSourceFiles(full);
            return full.endsWith('.ts') && !full.endsWith('.d.ts') ? [full] : [];
        });
    }

    it('no page or util references localStorage or sessionStorage directly', () => {
        const offenders = collectSourceFiles(path.join(root, 'src'))
            .filter(file => file !== ALLOWED)
            .filter(file => /\b(localStorage|sessionStorage)\b/.test(readFileSync(file, 'utf8')))
            .map(file => path.relative(root, file));

        expect(offenders).toEqual([]);
    });
});
