# Auditoria `f504c40` — spec

Fonte: `docs/audits/2026-09-19-f504c40.md` (GPT-6, Not approved: 2 Broken,
1 Slop). Os dois achados funcionais foram reconferidos contra o código em
2026-09-19: `DownloadService.downloadFile` cria as esperas de `download` e
`popup` antes de procurar o link e só as consome no `Promise.race`; o `throw`
de "link não encontrado" pula o race e o chamador fecha o browser dedicado, e
as duas esperas rejeitam sem ninguém ouvindo. `SigaaService.loadAllNews`
faz `log.warn` quando um corpo de notícia falha e devolve `ok()` no fim,
mesmo com zero corpos; os dois consumidores anunciam conclusão.

Corte em 2 tickets, independentes.

| NN | ID | Achado | Prioridade | Blocked by | Review |
|---|---|---|---|---|---|
| 01 | BUG-025 | Broken: falha de corpo de notícia vira sucesso do lote | P1 | — | agent |
| 02 | DL-009 | Broken: saída antecipada do fallback deixa esperas rejeitando sem tratamento | P2 | — | agent |

Fora do corte, e por quê:

- `playwright-login.service.ts` com 1.103 linhas: mesma decisão das três
  auditorias anteriores; o próprio auditor pede para não dividir por métrica.
- Hipótese da navegação por hash durante sync: excluída pelo auditor.
- `CONTRIBUTING.md`, piso de cobertura, assinatura, teto de warnings: decisões
  em `08-audit-dae3672/spec.md`.

## Problem Statement

1. No modo completo, o app promete deixar as notícias legíveis offline. Se o
   portal falhar em um ou em todos os corpos, o app diz "Finalizado!" (sync) ou
   "✅ Concluído" (botão da disciplina) e o aluno descobre offline que não tem
   o texto. A regra 3 do `CLAUDE.md` diz exatamente isso: `try/catch` (aqui,
   `if/else`) que só loga é bug.
2. Um download que falha antes de disparar a ação JSF devolve
   `{ success: false }` corretamente, mas deixa duas promises do Playwright
   rejeitando quando o browser dedicado fecha. O erro escapa do contrato de
   resultado e cai no tratador global do processo.

## Solution

1. `loadAllNews` conta os corpos que falharam. Se algum falhou, o lote falha
   com mensagem `N de M notícias sem conteúdo` e o código de erro da primeira
   falha. Contrato continua `AppResult<NewsSummary[]>`; nenhum tipo novo.
   Os consumidores já tratam `success: false`: o botão mostra erro e não toca
   o cache; o sync registra a disciplina em `failures`, mantém os cabeçalhos
   vindos de `getCourseFiles`, e o merge preserva corpos já salvos (controle
   positivo da auditoria). Estado parcial no resultado fica para quando
   alguém pedir.
2. As duas esperas ganham um `catch` vazio no momento em que são criadas. O
   `race` continua usando as promises originais, então o evento não se perde;
   só a rejeição órfã deixa de ser órfã. Nenhuma mudança de ordem.

## User Stories

1. Como aluno, quero que o sync completo me avise quando alguma notícia ficou sem corpo, em vez de dizer "Finalizado!".
2. Como aluno, quero que "Carregar todas" mostre erro quando o portal não entregou os textos, e não "Concluído".
3. Como aluno, quero que os corpos já baixados de antes sobrevivam a um sync em que o portal falhou.
4. Como autor, quero que um download sem link no DOM devolva falha e nada mais: nenhum `unhandledRejection` no log do processo.
5. Como autor, quero que nenhum dos dois consertos mude o caminho feliz: notícias completas e download com link continuam iguais.

## Implementation Decisions

### BUG-025 — notícias

1. **Binário, com contagem na mensagem.** Uma falha de detalhe basta para o
   lote falhar. Alternativa descartada: campo `partial`/`failed` no
   resultado, porque exigiria tipo em `shared/`, mudança em dois
   consumidores e teste de UI para o estado parcial, sem pedido de ninguém.
2. **Cabeçalhos não se perdem.** O sync já usa `news` de `getCourseFiles`
   quando `loadAllNews` falha; o merge preserva `content` anterior. Nada a
   fazer no renderer além de confirmar por teste.
3. **Código do erro** é o da primeira falha de detalhe (`detail.error`), para
   que `PORTAL_UNAVAILABLE` continue sendo `PORTAL_UNAVAILABLE` no toast.
4. **Cancelamento** (`signal.aborted`) segue devolvendo `CANCELLED` antes de
   qualquer contagem.

### DL-009 — fallback de download

5. **`catch` vazio anexado, não reordenação.** Criar as esperas depois do
   clique perde o evento; o auditor já disse isso. Um `.catch(() => {})`
   colado em cada `waitForEvent` marca a promise como tratada sem alterar o
   `race`, que segue nas promises originais.
6. **O teste força a rejeição.** Page falsa cujo `waitForEvent` devolve
   promise rejeitada quando um `close()` simulado roda; `evaluate` devolve
   `null` (sem link) e `script` ausente. O vitest falha sozinho em
   `unhandledRejection`, então o teste vermelho é: chamar, fechar, aguardar
   um tick. Sem `process.on` no teste.
