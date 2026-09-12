# PORTAL-006 — Aviso de incompatibilidade no renderer e restauração visível
Status: open
Stage: to-implement
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

- Commit: —
