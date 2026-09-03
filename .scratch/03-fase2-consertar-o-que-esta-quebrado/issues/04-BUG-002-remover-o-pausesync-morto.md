# BUG-002 — Remover o `pauseSync()` morto
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — fechado na sessão 2026-09-01

- Owner: Claude (sessão 2026-09-01)
- Dependencies: none
- Primary files: `src/pages/course-detail.ts`

#### Problem

`(window as any).api.pauseSync()` em `src/pages/course-detail.ts:58` e `:124`.
O método não existe no preload nem no main. Três defesas falharam: o cast
`as any` desligou o TypeScript, o `try/catch` engoliu o `TypeError`, e nenhum
teste exercitava o caminho. O código *parece* implementar proteção contra
concorrência e não implementa nada.

#### Decisão (Bruno, 2026-08-02): remover

Razão: nunca foi usado de fato e a ausência nunca foi sentida. A serialização
real é o `CONC-001`, na Fase 3.

#### Acceptance criteria

- As chamadas e seus `try/catch` foram removidos.
- `CONC-001` registra que a proteção está ausente e é conhecida.
- Nenhum `(window as any)` restante em `course-detail.ts` para acesso a `api`.

#### Rationale

Código que mente sobre o que faz é pior que código ausente. Remover torna o
débito visível. Ver anexo 7 de `docs/PLANO.md`.

#### Implementation notes (2026-09-01)

As chamadas a `pauseSync()` e seus `try/catch` já tinham sido removidas num
commit anterior (o arquivo tem comentários no lugar explicando a ausência), mas
a tarefa não foi marcada e **um critério ainda falhava**: restava um
`(window as any).api.loadAllNews(...)` em `course-detail.ts:80`. O método já
estava declarado no contrato `RendererApi` (`shared/ipc.ts`), então o cast era
puro resíduo — trocado por `window.api.loadAllNews`. Os
`(window as any).cleanupProgress` das linhas 292/294 não são acesso a `api` e
ficam para o `ARCH-001`/`SEC-002`.

A ausência da proteção contra concorrência está registrada no `CONC-001` (ver
nota lá) e no `DÉBITO-03`.
