# PIPE-005 — Tornar o E2E bloqueante e limitar o tempo dos jobs
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado e verificado em 2026-08-09

- Owner: Codex
- Dependencies: `QA-006`
- Primary files: `.github/workflows/quality.yml`

#### Problem

O job `e2e` tinha `continue-on-error: true`, então uma regressão que impedisse o
Electron de subir ainda deixava o workflow verde. Os jobs `gate` e `e2e` também
não tinham `timeout-minutes` e herdavam o teto padrão de seis horas do GitHub.

#### Fix

- Removidos `continue-on-error: true` e o comentário que o justificava.
- Adicionado `timeout-minutes: 15` aos jobs `gate` e `e2e`.
- Preservado `if: always()` no upload do relatório e dos screenshots.

#### Acceptance criteria

- Uma falha no E2E deixa o workflow `Quality` vermelho.
- Os dois jobs têm teto de 15 minutos.
- O artefato de diagnóstico continua sendo enviado mesmo quando o E2E falha.

#### Verification

Prova por mutação no branch descartável `codex/pipe-005-proof`, commit
`142c48e`: o helper de lançamento do E2E lançou um erro deliberado, sem alterar
nenhum spec do Playwright. O run
[`31322548186`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322548186)
concluiu com `failure`; `Typecheck, lint e testes` passou e
`E2E sem credencial` falhou. O branch foi removido depois da prova.

#### Implementation notes

- Commit da implementação: `b4656c0`
- O commit `142c48e` existiu apenas no branch de mutação descartável.
- Divergências da especificação: nenhuma.
