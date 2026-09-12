# CLEAN-004: Handshake do intervalo de loading por global não tipado
Status: resolved
Stage: done
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

#### Resolution (2026-09-11)

Aprovada na revisão sem mudança de código. Os dois commits da etapa 2 ficaram
separados como o loop exige: `3d1f22f` toca só `tests/unit/audit-loading.test.ts`
(mais o `Stage:`), `622ac43` só `src/pages/loading.ts` e `src/main.ts`.

Decisão: os handles viraram estado de módulo em `loading.ts` e
`stopLoadingInterval()` limpa o intervalo e o fade pendente.
`renderLoadingPage` chama `stopLoadingInterval()` na entrada — fora do texto do
ticket, mas dentro dos Primary files, e torna o render idempotente se houver um
intervalo vivo. `renderLoadingPage` tem um único chamador (`src/main.ts:53`) e
os dois ramos do `tryAutoLogin` (sucesso e `catch`) param o intervalo.

Critérios:

1. OK — `tests/unit/audit-loading.test.ts` afirma 2 timers pendentes após
   3000ms e 0 após `stopLoadingInterval()`. Uma versão que limpasse só o
   intervalo pararia em 1 e falharia.
2. OK — `grep -n "as any" src/pages/loading.ts src/main.ts` sai vazio (exit 1).
3. OK — `src/main.ts:56` e `:66`, os dois pontos que antes checavam o global.

Prova red-green:

    # src de 3d1f22f (pré-mudança) + o teste novo
    npx vitest run tests/unit/audit-loading.test.ts
    #  FAIL  TypeError: stopLoadingInterval is not a function — 1 failed (1)

    # com HEAD
    npm run quality
    #  tsc limpo; eslint 0 errors, 57 warnings (no-explicit-any pré-existentes)
    #  Test Files 52 passed (52) | Tests 636 passed | 4 skipped (640)

Sem achados. `docs/AUDITORIA_COMPLEXIDADE.md:40` e
`docs/audits/2026-09-09-40a0d01.md:198` ainda descrevem o global como vivo —
são registros históricos de auditoria, não foram tocados.

## Comments

- `src/pages/course-detail.ts:325,327` faz o mesmo com
  `(window as any).cleanupProgress`. Fora deste ticket: anotado, não tocar.
