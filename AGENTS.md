# AGENTS.md

Regras invioláveis e regras de sessão em `CLAUDE.md`; scraping em
`ARCHITECTURE.md`; tracker em `.scratch/` (formato e IDs em
`docs/agents/issue-tracker.md`); gate, convenções de teste, commits e registro
na issue em `docs/agents/orchestration.md`.

## Fluxo de trabalho

O loop de build é a skill `ticket-flow`, e ela é a única cópia: etapas,
entregas, transições de `Stage` e as regras que as sustentam estão lá, não
aqui. Sessão que recebe só um ID acha o ticket e despacha pelo `Stage:` dele.

## Bindings do fluxo (skill `ticket-flow`)

- Gate: `npm run quality`
- Base branch: `master`
- Models: stage 1 Fable, stage 2 Sonnet, stage 3 Opus

## Contraste de cor

O scan de axe (`tests/e2e/accessibility.spec.ts`, tema claro e escuro) fica
fora do `npm run quality` — é Playwright, ~16s, e não roda no Linux montado
(ver CLAUDE.md). Mudança que toca cor de texto/fundo em `src/styles/*.css`
roda `npm run test:e2e -- accessibility` manualmente antes do merge (`A11Y-001`,
2026-09-10): o scan em tema claro sozinho já deixou passar uma regressão de
contraste que só aparecia no escuro.
