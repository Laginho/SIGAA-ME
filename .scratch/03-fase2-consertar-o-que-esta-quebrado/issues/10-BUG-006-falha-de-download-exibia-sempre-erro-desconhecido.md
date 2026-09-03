# BUG-006 — Falha de download exibia sempre "Erro desconhecido"
Status: resolved
Priority: P2
Tracker status at migration: `DONE` — corrigido na sessão 2026-08-04

- Status: `DONE` — corrigido na sessão 2026-08-04
- Priority: `P2`
- Owner: Claude
- Dependencies: none
- Primary files: `src/pages/course-detail.ts`

#### Problem

`course-detail.ts:372` lia `result.error` no retorno de
`window.api.downloadFile`. Esse campo **nunca existiu**: o serviço devolve
`message` (`sigaa.service.ts:231,273,278`). Como o retorno era `any`, ninguém
reclamou. Em toda falha de download o usuário via
`Erro no download: Erro desconhecido` em vez da causa real — a informação era
produzida pelo main, atravessava o IPC, e era descartada no último passo.

#### Fix

`result.error` → `result.message`.

#### Por que registrar isto

Foi **o typecheck que encontrou**, no minuto em que o retorno deixou de ser
`any`. É a evidência concreta de que o gate da Fase 1 se paga: o mesmo
mecanismo do `BUG-002` (tipo desligado esconde acesso a campo inexistente),
mas com sintoma silencioso em vez de no-op. Ninguém ia achar isso lendo código.
