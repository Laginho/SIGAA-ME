# BUG-008 — `getSettings` declarado, com handler, e sem ponte no preload
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — corrigido na sessão 2026-08-05

- Status: `DONE` — corrigido na sessão 2026-08-05
- Priority: `P1`
- Owner: Claude
- Dependencies: none
- Primary files: `electron/preload.ts`, `tests/unit/preload-contract.test.ts`

#### Problem

`src/vite-env.d.ts` declarava `getSettings`, o `main.ts` atendia o canal
`get-app-settings`, e o `contextBridge` do preload **não expunha a ponte**. As
duas extremidades existiam e o meio não. Cinco call sites do renderer lançavam
`window.api.getSettings is not a function` em runtime, com `tsc` verde — porque
o `.d.ts` é uma declaração, não uma verificação.

#### Fix

`getSettings: () => ipcRenderer.invoke('get-app-settings')` no preload.

#### Por que registrar isto

Mesmo mecanismo do `BUG-002` (`pauseSync`) e do `BUG-006`: a fronteira IPC tem
três pontas — declaração, ponte e handler — e o TypeScript só olha a primeira.
Uma ponta solta é invisível para o compilador e para a suíte. Foi o que motivou
o teste de contrato do `QA-004`.
