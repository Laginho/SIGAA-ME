# DOC-002 — Escrever `CLAUDE.md`
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — `CLAUDE.md` existe na raiz (sessão 2026-08-02)

- Owner: —
- Dependencies: `DOC-001`
- Primary files: New: `CLAUDE.md` (raiz)

#### Required content

- Comandos do projeto (dev, build, test, quality).
- Arquitetura em uma frase + ponteiro para `ARCHITECTURE.md`.
- Regras invioláveis: nunca `innerHTML` com dado do SIGAA; nunca `as any` para
  atravessar IPC; todo canal IPC novo precisa de tipo e validação; nunca
  `try/catch` que só faz `console.error`.
- O que verificar antes de commitar.
- Ponteiro para este tracker e para `docs/PLANO.md`.

#### Acceptance criteria

- Um agente sem contexto prévio consegue trabalhar no repositório sem repetir os
  erros conhecidos (`pauseSync`, `as any` em IPC, `innerHTML` com dado externo).

#### Rationale

Este é o artefato que teria evitado boa parte da dívida atual. Codifica o
julgamento do projeto num lugar que agentes futuros herdam automaticamente.
