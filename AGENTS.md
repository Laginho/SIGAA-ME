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
