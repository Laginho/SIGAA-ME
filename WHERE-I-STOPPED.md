# Onde parei — 2026-09-10

Nota descartável. Estado da branch `a11y-001` no fim do dia 2026-09-10, para
retomar de outro PC.

## Os quatro tickets

| Ticket | O que é | Estado |
|---|---|---|
| **A11Y-001** | O trabalho de verdade: acessibilidade do app — `aria-label` em botão só-ícone, `div`→`button`/`a`, `<dialog>` nativo, contraste de cor. Vive na branch `a11y-001`. | Reaberto, 5 itens |
| **QA-007** | Não é trabalho de app. Auditoria somente-leitura **do diff da A11Y-001**. Entregável é documento, zero código. | Fechado hoje |
| **A11Y-002** | Contraste no tema escuro do modal de notícia aberto. Achado pela QA-007. | Na fila |
| **A11Y-003** | Contraste no tema escuro do texto de progresso da sync. Achado pela QA-007. | Na fila |

## Por que a QA-007 existe

A A11Y-001 caiu em revisão três vezes, e as três falhas têm o mesmo formato:
**correção aplicada a um de dois casos quase idênticos, com o irmão
esquecido.**

- Volta 1: listener removido num caminho de fechamento; o botão duas linhas
  acima ficou com o vazamento.
- Volta 2: `modalTitle` resetado em três caminhos; `modalMeta`, a linha de
  baixo do mesmo template, em nenhum.
- Volta 3: o mesmo `modalMeta`, achado só na terceira passada.

As três revisões leram o diff por **assunto** (segue o padrão do repo? bate
com o spec?). Nenhuma leu por **formato de defeito**. A QA-007 foi aberta para
fazer uma passada só: varrer os 22 arquivos caçando esse padrão.

## Como se ligam

A QA-007 audita a branch onde a A11Y-001 está sendo feita e roteia o que acha:

- **Introduzido pela branch** → volta para a A11Y-001 como retrabalho.
- **Já quebrado antes da branch** → vira ticket próprio.

Foi daí que saíram a A11Y-002 e a A11Y-003. Quatro achados do primeiro tipo,
dois do segundo.

## O que aconteceu no dia 2026-09-10

Sol rodou a QA-007 e escreveu o relatório
(`docs/audits/2026-09-10-a11y-001-simetria.md`). A revisão de etapa 3 conferiu
os achados contra o código, confirmou todos, achou **um que faltou**
(`.back-link` duplicada entre `settings.css` e `sync-selection.css`, com
`:hover` sem tema — cerca de `1,4:1` no escuro), mandou esse para a A11Y-003 e
fechou a QA-007.

Efeito líquido: a lista de retrabalho da A11Y-001 foi de 1 item para 5.

### Os 5 itens de retrabalho da A11Y-001

Estão no fim do ticket, sob `## Comments`:
`.scratch/05-fase4-prontidao-para-distribuicao/issues/03-A11Y-001-fix-document-controls-and-modal-accessibility.md`

1. `#modalMeta` não é limpo entre aberturas do modal (o item da volta 3 — já
   tem handoff escrito, `handoffs/A11Y-001-rework-3.md`).
2. `.news-item` virou `<button>` e o reset de estilo não repôs
   `font-size`/`line-height` — o título encolheu de `16px/24px` para
   `13,33px/normal`. **Regressão visível.**
3. Teste de `:focus-visible` com falso verde: só exige `outlineStyle !== "none"`,
   e sem a regra de produção o Chromium devolve `auto` com largura `0px`.
4. Asserções gêmeas com força desigual (cinco pontos, detalhados no relatório).
5. Os novos `<button>` contêm `div`/`p`, que não pertencem ao modelo de
   conteúdo do botão. **Sem sintoma observável** — candidato a sair desta volta.

## Estado do repositório

- Branch: `a11y-001`, em `98b83fc`, igual ao `origin/a11y-001`. Árvore limpa.
- 17 commits à frente do `master`, 0 atrás. Sem drift, sem rebase pendente.
- Os três commits do dia: `b8d1f61` (fecha a QA-007), `fbae2b1` (ledger),
  `98b83fc` (rastreia a auditoria de 2026-09-09, que estava fora do git).
- Baseline do gate para comparar amanhã: **627 passed / 4 skipped**, e2e
  **14 passed**, 0 erro de lint.

## Próximos passos

1. **Etapa 1 (Fable).** Escrever os 4 achados novos no corpo da A11Y-001 como
   requisito de verdade — Primary files + critério numerado — e escrever o
   handoff `rework-4`. **Se pular isto, a etapa 2 faz só o `modalMeta`**: o
   handoff atual diz "Um item", e a regra do loop trata comentário não
   desdobrado como nota que a etapa 2 pode ignorar. Decidir aqui também se o
   item 5 fica nesta volta ou vira ticket próprio.
2. **Etapa 2 (Sonnet).** Commit de teste vermelho primeiro, depois commit de
   código, gate verde, `Stage: to-review`.
3. **Etapa 3 (Opus).** Revisa. Se passar, faz o merge e fecha. Se um achado
   exigir teste novo ou tocar arquivo fora dos Primary files, reabre.

A A11Y-001 já voltou três vezes e esta volta tem cinco itens em vez de um.
Contar com uma quarta reabertura é mais realista do que contar com o merge.

A A11Y-002 e a A11Y-003 estão `Blocked by: A11Y-001` — são depois do merge,
não de amanhã.

---

**Apague este arquivo quando terminar.** Ele não é parte do tracker; o que
vale está no ticket e no relatório de auditoria.
