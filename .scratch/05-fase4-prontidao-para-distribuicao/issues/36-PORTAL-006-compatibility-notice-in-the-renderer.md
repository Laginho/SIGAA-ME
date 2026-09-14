# PORTAL-006 — Aviso de incompatibilidade no renderer e restauração visível
Status: resolved
Stage: done
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

#### Resolution (2026-09-13)

Revisão da etapa 3 (Opus), eixos Standards e Spec: **Approve, sem mudança de
código**. PR #23, merge `6c09ef8`.

Critérios 1, 2, 3 e 5 verificados com teste. Critério 5 vale nos termos que o
próprio ticket cita (`dashboard.ts:229`): não existe hook de unmount no
roteador — `src/main.ts` só chama a função de render —, então a disciplina real
é unsubscribe-then-resubscribe no mount mais logout/clear-all no dashboard, e é
o que foi feito. No máximo um listener por módulo fica vivo, e ele sai por
`querySelector` nulo enquanto a outra página está montada.

**Lacuna aceita no critério 4:** nenhum teste monta com `incompatible` e checa a
lista de disciplinas. Reproduzi com uma sonda descartável — o aviso entra depois
do `.dashboard-header`, o `loadCoursesFromCache` renderiza normalmente e o
comportamento está certo. O que falta é a asserção que trava o critério.

Verificação da revisão:

- Separação testes/código conferida por `diff --stat` commit a commit. O commit
  de código é o único a tocar `src/`, e não toca nenhum arquivo de teste.
- Vermelho reproduzido: revertendo só o commit de código,
  `compatibility-notice.test.ts` cai para 6 de 8 — os 2 que passam são os casos
  `ok`, que nunca tiveram nó. Bate com o que o implementador relatou.
- Os 6 arquivos de teste fora dos Primary files foram lidos um a um: só somam
  chaves ao stub de `window.api`, nenhuma asserção mudou.
- Gate depois do rebase em `master` (que tinha andado com o `DEP-007`):
  typecheck limpo, ESLint 0 erros / 55 warnings pré-existentes, 697 passando +
  5 skipped em 61 arquivos. CI do PR verde nos três jobs.

## Comments

Dois achados fora dos Primary files, levantados na revisão da etapa 3
(2026-09-13). Nenhum bloqueou o merge; ficam aqui para a etapa 1 decidir se
viram ticket.

- **O aviso não tem CSS.** `.compatibility-notice` não existe em `src/styles/`:
  o nó renderiza como texto puro depois do header, sem cor, borda ou ícone. É
  legível, mas é um aviso P1 de kill-switch sem nenhum destaque visual. CSS está
  fora dos Primary files e nenhum critério pede estilo. O repo também não tem
  classe de banner/alerta pré-existente para reusar — seria uma nova.
- **A troca ao vivo não é anunciada.** O nó é um `<div>` sem `role="status"`. Na
  entrada da página ele está na ordem do documento e é lido normalmente; o que
  passa batido é o aviso que *aparece* com o usuário já na tela. Corrigir exige
  `role` no `HProps` do `src/utils/dom.ts`, fora dos Primary files, e o axe não
  detecta região dinâmica sem `aria-live` — nenhuma verificação automática
  cobriria.

A duplicação de `renderCompatibilityNotice` entre as duas páginas foi olhada e
deixada de propósito: são dois casos, e a regra 7 do `CLAUDE.md` é explícita
sobre não abstrair cedo demais.
