# Auditoria `dae3672` — tickets

Fonte: `docs/audits/2026-09-16-dae3672.md` (Opus 5, Not approved: 0 Broken,
4 Fragile, 11 Slop). Os quatro Fragile foram reconferidos contra o código em
2026-09-16 e o achado 1 reproduzido (`npm test` cria `999/Cálculo I/Lista 3 (N).pdf`).

Corte em 5 tickets, aprovado por Bruno em 2026-09-16. O `BUG-020` não vem da
auditoria: é bug visual reportado pelo autor no mesmo dia.

| NN | ID | Achados | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | QA-011 | Fragile 1 + Slop `.gitignore` | P1 | — | agent |
| 02 | PORTAL-012 | Fragile 2 e 3 (mesma linha) | P1 | — | agent |
| 03 | BUG-020 | modal de notícia fora do centro | P2 | — | agent |
| 04 | DL-008 | Fragile 4 | P2 | — | agent |
| 05 | CLEAN-011 | Slop: cortes pequenos, um commit cada | P3 | — | agent |
| 06 | QA-012 | root cause do QA-011: `tsconfig` não vê `tests/` | P2 | — | agent |
| 07 | CLEAN-012 | follow-up do QA-012: `IncomingCourse` e `deps: any` | P3 | — | agent |
| 08 | BUG-021 | overlay de sync translúcido e não cobre a página (Bruno, 2026-09-17) | P2 | — | agent |
| 09 | CLEAN-013 | tooltip da bandeja diz "Background Sync" (Bruno, 2026-09-17) | P3 | — | agent |

Nenhum ticket bloqueia outro; os Primary files não se cruzam. `CLEAN-011` toca
`course-detail.ts` e `BUG-020` toca `course-detail.css`: arquivos diferentes.

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.144 linhas: quebrar por contagem de linha
  é churn; só quando aparecer uma costura real.
- Resíduo na raiz (`10/`, `999/`, `debug/`, `logs/`, `.test-user-data*`, logs
  soltos): local e não rastreado. Apagar à mão; o `QA-011` impede que volte.
- `DÉBITO-01`: o ticket já diz o que falta. Decisão do autor, não fluxo.
- `CONTRIBUTING.md`, piso de cobertura, `--coverage` no gate local: projeto solo
  com agentes; o piso cresce pelos testes dos tickets 01, 02 e 04.
