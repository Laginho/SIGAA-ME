# DOC-001 — Corrigir os documentos de auditoria
Status: resolved
Priority: P1
Tracker status at migration: `DONE`

- Owner: Claude (sessão 2026-08-02)
- Dependencies: none
- Primary files: `CODE_REVIEW.md`, `docs/HARDENING_TRACKER.md`, `docs/PLANO.md`

#### Acceptance criteria

- `CODE_REVIEW.md` não contém mais o erro factual sobre a chave não fechada.
- A escala do achado de `innerHTML` está precisada (9 sinks, não 47).
- `notification-store.ts` e `settings.ts` removidos da lista de afetados;
  `toast.ts` adicionado.
- Os 5 achados novos estão registrados como tarefas neste tracker.
- A refutação do `download.service.ts` como código morto está documentada.

#### Implementation notes

- Commit: —
- Decisões: auditoria original mantida como registro histórico, com correções
  marcadas inline como `[CORRIGIDO 2026-08-02]` em vez de reescrita. Preserva o
  rastro do que foi pensado e quando.
