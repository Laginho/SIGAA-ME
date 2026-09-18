# Auditoria `c80ce5d` — tickets

Fonte: `docs/audits/2026-09-17-c80ce5d.md` (GPT-6, Not approved: 2 Broken,
0 Fragile, 2 Slop). Os dois Broken foram reconferidos contra o código em
2026-09-18: `fetchCourseFiles(courseId)` depois do `await` em
`course-detail.ts:106,493,497` e `renderNewsIntoModal` depois do `await` em
`:598`, ambos sem guarda de "a tela ainda é esta".

Corte em 2 tickets.

| NN | ID | Achados | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | BUG-022 | Broken 1 e 2 (mesma causa: resposta antiga escreve em DOM global) | P1 | — | agent |
| 02 | CLEAN-014 | Slop: flag `--sigaa-dev` sem consumidor + filtros sem efeito no teste | P3 | — | agent |

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.147 linhas: mesma decisão da auditoria
  anterior, só quando aparecer uma costura real.
- Resíduo `10/`, `999/` e `docker_cheat_sheet.txt`: entraram no repo por
  acidente no commit `e2dd6e8` (o do próprio relatório). Apagados à mão em
  2026-09-18; `audit-download-fallback-identity` e `logging-boundary` rodados
  depois não os recriam.
- `CONTRIBUTING.md`, piso de cobertura, assinatura: decisões já registradas em
  `08-audit-dae3672/spec.md`.
