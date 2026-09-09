# OBS-005 — Migrate playwright-login and enforce `no-console` in electron/**
Status: open
Stage: to-review
Priority: P2
Blocked by: OBS-004 (fechado)

- Owner: —
- Dependencies: `OBS-001`, `OBS-004`
- Primary files:
  - `electron/services/playwright-login.service.ts`
  - `electron/services/logger.service.ts` (só a assinatura estreita)
  - `eslint.config.js`
  - Editados: `tests/unit/logger-redaction.test.ts` (um `@ts-expect-error` em
    chamada com vararg), mock de `logger` em `playwright-lifecycle` ganha
    `scope()`, `tests/e2e/clear-all.spec.ts`

Fatiado de `OBS-001` em 2026-09-08 (`/to-tickets`, segunda rodada): segundo
lote do migrate mais o **contract**. Seam: nenhum `console.*` sobra em
`electron/**`, e o tipo do logger só aceita `meta`.

#### What to build

- `PlaywrightLoginService`: 85 `console.*` e 24 chamadas ao logger antigo viram
  `logger.scope('PlaywrightLogin')` com `(message, meta?)`. Nome do aluno,
  nome de disciplina, título, `fileName` e saída do console do navegador
  (`page.on('console')`) vão em `meta`, sob chaves que a camada (b) de
  `OBS-001` redige em produção (`name`, `courseName`, `title`, `fileName`,
  `body`). Os dumps `debug_*.html` ficam (`OBS-003`); só o
  `console.log('Saved debug_...')` ao lado migra.
- **Contract, parte 1:** `ScopedLogger` e `LoggerService` passam de
  `...args: unknown[]` para `meta?: LogMeta`. Qualquer vararg que sobrou em
  qualquer arquivo vira erro de tipo.
- **Contract, parte 2:** `eslint.config.js` troca a catraca por arquivo de
  `OBS-001`/`OBS-004` por uma regra só: `no-console: error` em `electron/**`,
  exceto `electron/services/logger.service.ts`.

#### Acceptance criteria

1. **Tipo estreito.** `npm run typecheck` verde com `meta?: LogMeta`; o
   `@ts-expect-error` plantado em `logger-redaction.test.ts` sobre uma chamada
   com vararg deixa de reclamar de "unused directive" só quando a assinatura
   estreitou.
2. **Um logger, de verdade.** `npm run lint` verde com `no-console: error` em
   `electron/**`; nenhuma lista de arquivos para `no-console` sobra no
   `eslint.config.js`.
3. **Sem interpolação.** Grep no diff de `playwright-login.service.ts` por
   `\$\{[^}]*(\.name|\.title|fileName|courseName|basePath|filePath|Path\b)`
   dentro de `logger.*(`/`log.*(` dá zero, inclusive nas linhas que hoje
   interpolam `fileName` no download. É a **única** prova para este arquivo:
   ele lança Chromium e fica fora do teste de fronteira.
4. `tests/e2e/clear-all.spec.ts` planta `logs/app.log` e `logs/app.1.log`, sem
   `sigaa-me.log`/`scraper.log`. **Não roda no loop**; passe pré-release.

#### Verification

```text
npx vitest run tests/unit/logger-redaction.test.ts
npm run quality
```

## Testes que a etapa 2 escreve (commit próprio, vermelhos)

Não há arquivo novo. O vermelho vem de dois lugares:

- `tests/unit/logger-redaction.test.ts` ganha uma chamada
  `logger.info('x', 'vararg')` sob `// @ts-expect-error`: com a assinatura de
  transição a diretiva é "unused" e o typecheck falha; com `meta?` ela passa.
- `eslint.config.js` com a regra em `electron/**` faz `npm run lint` falhar em
  cada `console.*` de `playwright-login.service.ts` até a migração terminar.
  A regra entra no commit de testes.

## Para o revisor (o que os testes não cobrem)

- Nenhum `try/catch` novo que só chame `logger.error` (regra 3).
- Nenhum `eslint-disable` para `no-console` fora de `logger.service.ts`.
- O `console.error` único de falha do sink em `logger.service.ts` continua
  sendo o único `console` do processo main.

## Fora de escopo, com ticket

- `OBS-003` — dumps de HTML cru via `DiagnosticsService` e limpeza de legado;
  depende deste ticket porque edita o mesmo arquivo.
- `OBS-002` — `[op:<id>]`.

## Comments

Branch: `OBS-005` (commits em cima de `59aabca`, `master` não tocado).

**Achado sobre o critério 1 (para o revisor decidir, não decidi sozinho):**
`tsconfig.json` tem `"include": ["src", "electron", "shared"]` — `tests/` não
entra. `npx tsc --noEmit --listFiles` confirma: zero arquivos de `tests/` no
programa. O `@ts-expect-error` plantado em `logger-redaction.test.ts` nunca é
visto por `npm run typecheck` (nem pelo `vitest run`, que não faz type-check).
O mecanismo de prova que o critério 1 descreve ("a diretiva vira unused e o
typecheck falha") não roda no gate — plantei o teste do jeito que o ticket
pede porque é a assinatura, mas a prova real de que a assinatura estreitou é
que `electron/services/logger.service.ts` e
`electron/services/playwright-login.service.ts` (que estão em `include`)
typecham limpos com `meta?: LogMeta`, e isso o gate cobre de verdade.

**Red confirmado antes do código (via `git stash` das duas mudanças de
produção):** `npx eslint electron/services/playwright-login.service.ts` com o
`eslint.config.js` do commit de testes deu 170 erros (85 `console.*` × 2
regras). Depois do código: 0 erros, mesma suíte.

**Ajuste em teste fora da lista de Primary files:**
`tests/integration/portal-selector-resilience.test.ts:513` fazia
`toHaveBeenCalledWith(expect.stringContaining(...))` sobre a mensagem antiga
(string única, interpolada) de um dos 24 `logger.error(...)` migrados. Depois
da migração a chamada é `(mensagem, { error })` — dois argumentos — e o
critério 3 proíbe voltar a interpolar. Ajustei a asserção para casar com a
nova forma (mensagem + `{ error: expect.any(Error) }`); não é seam nova, é o
mesmo contrato do ticket batendo num teste que não estava na lista.

**Achado não relacionado, não mexido:** `tests/unit/sync-selection.test.ts`
("preserves first course snapshot and saves second course when first fails
and second succeeds") falha `expect(window.location.hash).not.toBe('#/dashboard')`
quando a suíte inteira roda, e passa isolado. Confirmei que é pré-existente
rodando a suíte inteira num worktree do commit `59aabca` (antes deste
ticket) — mesma falha lá. Não é do OBS-005; fica para quem for mexer em
`sync-selection.test.ts`/isolamento de `jsdom` entre arquivos.

**Gate no HEAD da branch:** `npx tsc --noEmit` limpo; `npx eslint .` → 0 erros,
62 warnings (pré-existentes, `no-explicit-any`); `npx vitest run` → 602
passed, 1 failed (o flake acima, não relacionado), 4 skipped.
