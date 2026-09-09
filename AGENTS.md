# AGENTS.md

Regras invioláveis e regras de sessão em `CLAUDE.md`; scraping em
`ARCHITECTURE.md`; tracker em `.scratch/` (formato e IDs em
`docs/agents/issue-tracker.md`); gate, convenções de teste, commits e registro
na issue em `docs/agents/orchestration.md`.

## Fluxo de trabalho

Um ticket por vez. O humano dispara cada etapa à mão, em sessão limpa, e aprova
entre a 1 e a 2. O ticket é o contrato; o commit é o handoff — nada de documento
intermediário. Tarefa trivial vai direto, sem loop.

| # | Modelo | Skill | Entrega | Para e reporta se |
|---|---|---|---|---|
| 1 | Fable | `grill-me` → `to-spec` → `to-tickets` | `spec.md` + um `issues/NN-ID-slug.md` por ticket, `Status: open` | o humano não aprovar seams ou fatiamento |
| 2 | Sonnet | `tdd` | branch `ID`, `Status: claimed`; **commit só de testes, vermelhos pelo motivo certo**; depois commits de código sem tocar `tests/`; gate verde | o ticket exigir mais de um seam (volta à etapa 1) ou o teste se provar errado depois de commitado (`Status: blocked` + motivo) |
| 3 | Opus | `code-review` (Standards + Spec) | correções pequenas; `Status: resolved` + linha no `ledger.md` **no mesmo commit**; PR | achado grande → ticket reaberto, volta à etapa 2 |
| ↩ | quem achou | — | achado que pertence a **outro** ticket: bloco ao fim do ticket-alvo, sob `## Comments` | nunca no corpo do ticket-alvo; dobrar Comment em requisito é da etapa 1 |

Merge: direto se a etapa 3 não alterou código; se alterou, o PR espera o humano.
Refactor fora do que o ticket tocou vira ticket `CLEAN-*`.
