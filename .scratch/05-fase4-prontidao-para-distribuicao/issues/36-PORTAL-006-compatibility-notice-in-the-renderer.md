# PORTAL-006 — Aviso de incompatibilidade no renderer e restauração visível
Status: open
Stage: to-review
Priority: P1
Blocked by: PORTAL-005

- Owner: —
- Dependencies: `PORTAL-005` (entrega `getCompatibilityStatus()` e
  `onCompatibilityChanged()` na `RendererApi`)
- Primary files:
  - `src/pages/dashboard.ts`
  - `src/pages/sync-selection.ts`
  - New: `tests/unit/compatibility-notice.test.ts`

Fatiado de `PORTAL-005` em 2026-09-12: o main guarda o estado e avisa; este
ticket é o que o usuário vê. Sem ele, o kill-switch desliga o sync em silêncio.

#### What to build

1. `dashboard.ts`: no mount, `await window.api.getCompatibilityStatus()`. Se
   `incompatible`, mostra um aviso em elemento próprio, via `textContent`:
   "O SIGAA mudou e a sincronização automática está pausada desde <data>. Seus
   arquivos continuam disponíveis. Uma sincronização manual completa reativa."
   Assina `onCompatibilityChanged` e mostra/esconde conforme `state`; cancela
   a assinatura no unmount, como já faz com `onBackgroundSyncUpdate`
   (`dashboard.ts:229`).
2. `sync-selection.ts`: mesmo aviso, acima dos botões. Os botões continuam
   habilitados: são o caminho de restauração. Depois de um `startSync` que
   completou `getCourseFiles` com sucesso, o aviso some via
   `onCompatibilityChanged`; nada de lógica local de "deu certo", o main é a
   fonte.

#### Acceptance criteria

- Com `getCompatibilityStatus()` devolvendo `incompatible`, o dashboard e a
  tela de sync mostram o aviso; com `ok`, nenhum nó do aviso existe no DOM.
- Evento `compatibility-changed` para `ok` remove o aviso sem reload; para
  `incompatible`, mostra.
- Nenhum `innerHTML` (regra 1 do `CLAUDE.md`): texto fixo mais data formatada,
  via `textContent`.
- Dados em cache seguem renderizados com o aviso visível (AC2 do `PORTAL-005`).
- Unmount cancela a assinatura (`QA-008` mostrou o custo de listener vazando
  entre rotas).

#### Verification

```text
npx vitest run tests/unit/compatibility-notice.test.ts
npm run quality
```

## Testes que a etapa 2 escreve

- `tests/unit/compatibility-notice.test.ts` — `window.api` mockado com
  `getCompatibilityStatus`/`onCompatibilityChanged` (`vi.fn()` que devolve o
  `off`), monta o dashboard e a tela de sync em jsdom, checa presença e
  ausência do aviso nos dois estados, a troca ao vivo pelo callback, e que o
  `off` é chamado no unmount. Harness: o que `tests/unit/sync-selection.test.ts`
  já usa para montar a página.

## Para o revisor

- O texto do aviso é constante; a única parte variável é a data, formatada com
  `toLocaleDateString('pt-BR')`. Nada vindo do SIGAA entra nele.
- Nenhuma chamada nova ao main além das duas da `RendererApi` do `PORTAL-005`.

#### Implementation notes

- Commits: `352bc54` (testes, red pelo motivo certo), `0130111` +
  `2c54dbd` (roster mecânico dos mocks `window.api` que antecediam o
  contrato — mesmo padrão do `ipc-validation.test.ts` no `PORTAL-005`),
  `3b36714` (fixture: `since` de meio-dia local em vez de meia-noite UTC,
  senão `toLocaleDateString('pt-BR')` derruba um dia conforme o fuso da
  máquina), `6a8761b` (código).
- `renderCompatibilityNotice` em cada página: remove qualquer
  `.compatibility-notice` existente e só insere um novo nó quando
  `state === 'incompatible'` — nunca `innerHTML`, texto fixo + `since`
  formatado por `toLocaleDateString('pt-BR')`. Mesma disciplina de "um
  listener vivo por vez" do `onBackgroundSyncUpdate` (DATA-002):
  unsubscribe-then-resubscribe no mount, e a assinatura cai junto com a de
  sync no logout/clear-all do dashboard.
- `sync-selection.ts` não ganhou lógica local de "sync deu certo": o aviso
  só some pelo evento `onCompatibilityChanged`, como o ticket pede.
- Fora dos Primary files, mecânico e declarado: `window.api` em
  `dashboard-a11y.test.ts`, `dashboard-session-actions.test.ts`,
  `sync-selection.test.ts`, `account-isolation.test.ts` (2 stubs),
  `renderer-content-security.test.ts` e `sync-selection-a11y.test.ts` (sem
  stub nenhum antes — `sync-selection.ts` nunca tocava `window.api` fora de
  um clique) ganharam `getCompatibilityStatus`/`onCompatibilityChanged`.
  Nenhuma asserção de comportamento mudou, só o roster — os dois primeiros
  commits saíram antes do código (preparo), o último depois (`npm run
  quality` pegou os 3 arquivos que a exploração inicial não tinha achado).
- Red-green: `git revert --no-commit 6a8761b` faz `compatibility-notice.test.ts`
  cair para 6 de 8 (as duas que passam são os casos `ok` — nunca houve nó
  mesmo antes); revertendo o revert, os 8 voltam a passar.
- Gate (`npm run quality`): typecheck limpo, ESLint 0 erros (55 warnings
  `no-explicit-any` pré-existentes, nenhum novo), 697 testes passando + 5
  skipped em 61 arquivos.
