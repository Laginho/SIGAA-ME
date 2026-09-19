# Auditoria `6feca4d` — spec

Fonte: `docs/audits/2026-09-19-6feca4d.md` (GPT-6, Not approved: 1 Broken,
1 Slop). O achado funcional foi reconferido contra o código em 2026-09-19:
em `download.service.ts`, `reloadDownloadPromise` (timeout 15s) é criada
antes de `await popup.reload().catch(...)`, mas só recebe `await` depois que
o reload termina. Reload lento (>15s) sem download deixa o timeout rejeitar
sem tratador: `unhandledRejection` no main, e só depois a falha controlada.
É consequência direta da ordenação escolhida no DL-010.

Corte em 1 ticket.

| NN | ID | Achado | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | DL-011 | Broken: timeout da espera de download rejeita sem tratador enquanto o reload do popup está pendente | P2 | — | agent |

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.132 linhas: mesma decisão das cinco
  auditorias anteriores; o auditor diz que não bloquearia aprovação.
- `CONTRIBUTING.md`, piso de cobertura, assinatura, teto de warnings: decisões
  em `08-audit-dae3672/spec.md`.
- Regressão com Chrome real e servidor lento: fica fora. Page falsa com
  `reload()` que só resolve depois de o `waitForEvent('download')` rejeitar
  reproduz a ordenação temporal, e é o padrão dos testes de download.
