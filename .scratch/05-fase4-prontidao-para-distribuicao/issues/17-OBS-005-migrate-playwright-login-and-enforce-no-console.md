# OBS-005 — Migrate playwright-login and enforce `no-console` in electron/**
Status: open
Priority: P2
Blocked by: OBS-004

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
