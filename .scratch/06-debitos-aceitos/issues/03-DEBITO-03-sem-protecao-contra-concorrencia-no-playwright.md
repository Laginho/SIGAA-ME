# DÉBITO-03 — Sem proteção contra concorrência no Playwright
Status: open
Priority: —
Tracker status at migration: (sem linha de status — débito aceito conscientemente)

- **O quê:** sync em background e ação do usuário podem navegar a mesma página
  Playwright simultaneamente. O `pauseSync` que deveria evitar isso nunca
  existiu de fato (`BUG-002`).
- **Por quê adiado:** a solução correta é o `CONC-001`, trabalho de Fase 3.
- **Gatilho:** obrigatório na Fase 3. Sobe de prioridade imediatamente se
  aparecer qualquer bug de sincronização corrompendo dados.
- **Mitigação:** nenhuma. O risco existe hoje e é conhecido.
