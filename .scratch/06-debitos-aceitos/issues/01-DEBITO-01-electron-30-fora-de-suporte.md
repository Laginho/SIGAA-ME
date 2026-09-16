# DÉBITO-01 — Electron 30 fora de suporte
Status: open
Stage: blocked
Priority: —
Tracker status at migration: (sem linha de status — débito aceito conscientemente)

- **O quê:** o projeto rodava Electron 30.5.1, fora da faixa suportada pelo
  Electron (as três majors mais recentes). O `DEP-005` (2026-09-14) subiu para
  `41.10.7`, a versão do `package.json` hoje, e tirou o projeto da faixa
  vulnerável apontada pelo `npm audit`. Não verificado aqui se `41.10.7` está
  dentro das três majors mais recentes do Electron no momento da leitura —
  checar antes de fechar o débito.
- **Por quê adiado (histórico):** na época, atualizar mudava a versão do
  Chromium embutido sem suíte que provasse que o scraper (Playwright, cookies,
  sessão JSF) continuava funcionando.
- **Gatilho:** já cumprido — Fase 1 fechada e suíte executável em CI (ver
  `.scratch/`, `QA-001`). O `DEP-005` rodou o live smoke do scraper contra o
  Electron novo (6/6, autor, 2026-09-14) antes de mergear.
- **O que falta para fechar:** confirmar que `41.10.7` está dentro das majors
  suportadas pelo Electron hoje, e decidir se o débito fecha ou vira um novo
  ciclo de upgrade. Decisão do autor.

## Comments

- `Stage: blocked` porque o débito foi aceito conscientemente, não porque
  alguém parou no meio. O motivo e o gatilho de desbloqueio estão no corpo,
  em "Por quê adiado" e "Gatilho".
