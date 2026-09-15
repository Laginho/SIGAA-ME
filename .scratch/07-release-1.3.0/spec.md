# Release 1.3.0 — tickets da auditoria `d5bb393`

Fonte: `docs/audits/release-1.3.0/2026-09-15-d5bb393-merged.md` (união de quatro
auditorias cegas, 23 defeitos Broken/Fragile verificados duas vezes contra o
código). Os números de item abaixo são os do gabarito em
`docs/audits/release-1.3.0/README.md`.

Corte em 19 tickets, aprovado por Bruno em 2026-09-15 (`to-tickets`).

| NN | ID | Itens | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | SEC-004 | 7, 15 | P0 | — | human |
| 02 | BUG-014 | 14 | P1 | — | agent |
| 03 | BUG-015 | 5 | P0 | — | agent |
| 04 | DL-007 | 9, 11 | P0 | — | agent |
| 05 | BUG-016 | 8, 21 | P0 | — | agent |
| 06 | PORTAL-007 | 1, 2 | P1 | — | agent |
| 07 | PORTAL-008 | 13, 17 | P1 | PORTAL-007 | agent |
| 08 | BUG-017 | 3, 12, promessas soltas | P1 | — | agent |
| 09 | CONC-002 | 4 | P1 | — | agent |
| 10 | BUG-018 | 16 | P1 | — | agent |
| 11 | DATA-004 | 6, 19 | P2 | — | agent |
| 12 | OBS-006 | 10, 20 | P2 | — | agent |
| 13 | DATA-005 | 18 | P2 | — | agent |
| 14 | QA-009 | 23 + processo (animação) | P2 | — | agent |
| 15 | PIPE-007 | processo (lint, permissions, gitleaks) | P2 | — | agent |
| 16 | DOC-004 | documentação | P2 | — | human |
| 17 | CLEAN-007 | slop: cortes pequenos | P3 | — | agent |
| 18 | CLEAN-008 | slop: http-scraper + item 22 | P3 | — | agent |
| 19 | CLEAN-009 | slop: playwright-login | P3 | PORTAL-008, DL-007 | agent |

Agrupamentos e o motivo: 7+15 (o filtro de link cria o lote todo-`skipped`
que o item 15 quebra); 9+11 (mesmo caminho de reuso do fallback); 8+21 (mesmo
arquivo, mesmo teste); 3+12 (mesmo padrão: resultado ignorado); 6+19 (mesmo
serviço); 10+20 (mesmo serviço).

Os gates: `PORTAL-008` depende de `PORTAL-007` porque o caso "zero turmas"
muda o que `getCourses` devolve, e a propagação da falha tem de tratar esse
retorno como sucesso. `CLEAN-009` espera `PORTAL-008` e `DL-007` só para não
editar `playwright-login.service.ts` (1.119 linhas) em paralelo com quem muda
comportamento nele.

Fora, de propósito: `CONTRIBUTING.md` (as regras vivem em `CLAUDE.md` e
`AGENTS.md`); piso de cobertura no repositório inteiro (precisa de número
decidido, não de ticket); quebrar `playwright-login.service.ts` (refactor
largo, ticket `ARCH` próprio se for feito).
