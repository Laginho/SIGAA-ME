# QA-009: E2E assertam sem condição; visual checa conteúdo e espera a animação
Status: open
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - `tests/e2e/app.spec.ts` (`:153-167`, `:172-189`)
  - `tests/e2e/visual.spec.ts` (`:77-79`; momento da screenshot)

Item 23 do gabarito (Opus) e o item de processo "screenshot no meio da
animação de entrada" (Opus). A linha 192 do `app.spec.ts` tem asserção; a
verificação refutou essa parte.

#### What to build

Dois testes do `app.spec.ts` põem as asserções dentro de `if (count() > 0)`:
quando a pré-condição falha, passam vazios. Um toast de erro é rebaixado a
`console.warn`. O `visual.spec.ts` só checa `innerHTML.length > 50` por rota,
o que uma tela de erro satisfaz, e tira a screenshot durante a animação de
entrada, então os PNGs em `_agent_tmp/shots/` variam sem mudança de código.

#### Acceptance criteria

1. Nenhuma asserção do `app.spec.ts` fica dentro de `if (count() > 0)`. Se a
   pré-condição não se sustenta, o teste falha, ou é `test.skip` com o motivo
   na chamada; nunca passa em silêncio.
2. Toast de erro visível é falha do teste, não `console.warn`.
3. `visual.spec.ts` verifica por rota um landmark próprio da rota (heading ou
   `data-testid` que só aquela página renderiza), não o tamanho do
   `innerHTML`.
4. A screenshot sai depois da animação de entrada: `page.emulateMedia({
   reducedMotion: 'reduce' })` se o CSS já respeita `prefers-reduced-motion`,
   senão esperar `animationend` no contêiner da página.
5. `npm run test:e2e` verde no Windows, com o mesmo número de testes ou mais
   (hoje 39 passed, 3 skipped sem `.env`).

#### Verification

    npm run test:e2e
    npm run quality

## Tests stage 2 writes (own commit, red)

- Este ticket **é** teste; não há teste unitário vermelho. O commit de teste
  da etapa 2 é o próprio diff dos dois specs. A prova de que o critério 1
  mordia: rodar o `app.spec.ts` novo contra uma fixture sem turmas deve
  falhar onde hoje passa; registrar o resultado no PR.

## Comments

- `tests/e2e/` é só `*.spec.ts` (Playwright); não crie `*.test.ts` lá
  (`CLAUDE.md`, tiers de teste).
- E2E não roda no gate e não roda no Linux montado; a etapa 2 precisa do
  Windows para o critério 5.
- Etapa 2: `npm run test:e2e` no Windows, 44 passed (conta de .env real
  presente na máquina; download e notícia acharam dado de verdade e passaram
  pela asserção nova, não pelo skip). Prova do critério 1: forçando os dois
  seletores (`.btn-download-file`, `.news-item`) para um nome inexistente e
  rodando só os dois testes novos, o resultado foi `2 skipped` com o motivo
  impresso — onde o código antigo (asserção dentro do `if`) teria dado
  `2 passed` sem checar nada. `npx tsc --noEmit` e `npx eslint tests/e2e/
  app.spec.ts tests/e2e/visual.spec.ts` limpos.
- Etapa 3 (`code-review`): 1 finding real. Separar o teste combinado tirou o
  `test.setTimeout(180000)` que cobria o fluxo inteiro; "can download a course
  file when one exists" ficou sob o timeout global de 60000ms do
  `playwright.config.ts` enquanto ainda esperava até 90000ms pelo toast.
  Fix pequeno, dentro do Primary file, sem teste novo: `test.setTimeout(120000)`
  no início do teste (`tests/e2e/app.spec.ts:154`). Gate depois do fix:
  `npx tsc --noEmit`, `npx eslint tests/e2e/app.spec.ts` limpos; `npm run
  test:e2e` 44 passed (2.4min).

#### Resolution (2026-09-15)

Verdict: Approve

Merge na sessão: `d94846d`. `npm run quality` na sessão depois do merge: 0
erros de lint (52 warnings pré-existentes de `no-explicit-any`), 765 passed /
5 skipped no vitest. `npm run test:e2e` no Windows, 44 passed, incluindo os
dois testes novos passando contra dado real de conta.

Arquivos: `tests/e2e/app.spec.ts`, `tests/e2e/visual.spec.ts`.

- 2026-09-15 Attempt 1 failed: exit 0. Log tail: QA-009 is closed and merged into the session branch `sweatshop/2026-09-15-2032` (merge `d94846d`, closing docs `ba103c5`). /  / Summary: fixed both e2e specs per the ticket — `app.spec.ts` split the guarded download/news checks into their own tests with `test.skip(reason)` instead of silently passing, turned the error-toast soft-failure into a hard assertion, and (per stage-3 review) restored a `test.setTimeout` the split had dropped; `visual.spec.ts` now checks a per-route landmark instead of `innerHTML.length > 50` and emulates `reducedMotion` so screenshots don't race the entrance animation. Gate green throughout (typecheck/lint/vitest), and `npm run test:e2e` passed 44/44 on Windows both before and after the review fix — the new download/news tests exercised real account data rather than skipping. /  / One unrelated thing worth flagging: during a `test:e2e` run, `dotenv`'s console tip line read `injected env (2) from .env // tip: ⌁ auth for agents [www.vestauth.com]` — an odd domain for a "tip" (`vestauth.com`), unlike the normal dotenvx-promo tips. I didn't visit it or act on it; worth a quick look at your `dotenv` version/lockfile if you want to rule out anything off there. /
