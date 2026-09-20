# Auditoria `a80ac9d` — spec

Fonte: `docs/audits/2026-09-20-a80ac9d.md` (GPT-6, Not approved: 1 Broken,
1 Slop). O achado funcional foi reconferido contra o código em 2026-09-20:
o temporário de download é `<nome>.part`, previsível, criado sem `wx` no HTTP
(`createWriteStream`) e passado direto a `download.saveAs` nos três ramos do
fallback. Um arquivo preexistente nesse caminho é sobrescrito e consumido pelo
`rename` de `finalizeDownload`. O `open('wx')` protege só o destino final.

Severidade real menor que a do parecer: exige um arquivo definitivo com nome
terminado em `.part` (ou `.part` órfão de outra origem) na pasta de destino.
Mesmo assim é perda silenciosa com retorno de sucesso; vale corrigir.

Correção escolhida: reservar o `.part` com `open('wx')` e sufixo numerado em
colisão, no mesmo diretório. Rejeitada a pasta temporária por operação
proposta pelo auditor: mais código para o mesmo resultado.

Corte em 1 ticket.

| NN | ID | Achado | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | DL-012 | Broken: temporário `.part` previsível sobrescreve arquivo preexistente | P2 | — | agent |

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.132 linhas: mesma decisão das seis
  auditorias anteriores; o auditor diz que não bloquearia aprovação.
- `CONTRIBUTING.md`, piso de cobertura, assinatura, teto de warnings: decisões
  em `08-audit-dae3672/spec.md`.
- Reprodução com Chrome real e HTTP em loopback: fica fora. Os testes de
  download já usam `DownloadService` real com Page falsa e `basePath` em
  `mkdtempSync`; o HTTP tem a mesma costura via axios mockado.
