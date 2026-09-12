# CLEAN-004: Handshake do intervalo de loading por global não tipado
Status: open
Stage: to-implement
Priority: P3
Blocked by: nenhum

- Primary files:
  - `src/pages/loading.ts` (`renderLoadingPage`, o `(window as any).currentLoadingInterval` em `:38`; novo export `stopLoadingInterval`)
  - `src/main.ts` (`:56`, `:66`)
  - New: `tests/unit/audit-loading.test.ts`

#### What to build

`loading.ts` define `(window as any).currentLoadingInterval`; `main.ts` checa
`(window as any).stopLoadingInterval`, que **nunca é definido**. O intervalo de
3s que troca a mensagem de loading nunca é limpo: continua rodando sobre um
elemento que já saiu do DOM depois do auto-login. É o padrão "código que finge
implementar algo" do `CLAUDE.md`, com `as any` no meio.

Trocar por um export tipado: `loading.ts` guarda o handle em módulo e exporta
`stopLoadingInterval()`, que limpa o intervalo **e** o `setTimeout` de fade
pendente; `main.ts` importa e chama. Sem `window as any`.

#### Acceptance criteria

1. Depois de `renderLoadingPage` e 3000ms de fake timers, há exatamente 2
   timers pendentes (intervalo + fade); depois de `stopLoadingInterval()`, 0.
2. `grep -n "as any" src/pages/loading.ts src/main.ts` não retorna
   `LoadingInterval`.
3. `main.ts` chama `stopLoadingInterval()` nos dois pontos onde hoje checa o
   global (sucesso e `catch` do `tryAutoLogin`).

#### Verification

    npx vitest run tests/unit/audit-loading.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `git checkout 19ba8aa -- tests/unit/audit-loading.test.ts` (critério 1).
  Vermelho por `stopLoadingInterval` não exportado. Reprovar contra o master.
- Critério 3 é prova do revisor (grep no diff), não teste.

## Comments

- `src/pages/course-detail.ts:325,327` faz o mesmo com
  `(window as any).cleanupProgress`. Fora deste ticket: anotado, não tocar.
