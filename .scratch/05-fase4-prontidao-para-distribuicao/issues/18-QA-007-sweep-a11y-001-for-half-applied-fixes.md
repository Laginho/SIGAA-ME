# QA-007: Varrer o diff da `a11y-001` atrás de correção aplicada pela metade
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum

- Owner: —
- Dependencies: `A11Y-001`
- Primary files:
  - Nenhum. **Auditoria somente-leitura** — não altera código.
  - New: `docs/audits/2026-09-10-a11y-001-simetria.md`

#### What to build

Um relatório. Este ticket **não passa pela etapa 2 (`tdd`)** e não produz
commit de código: o entregável é o documento de auditoria, e cada achado vira
comentário sob `## Comments` do `A11Y-001` (se for retrabalho da branch) ou um
ticket próprio (se não for).

A branch `a11y-001` levou três voltas de revisão. Os três achados que a
seguraram têm o mesmo formato, e não é coincidência:

| Volta | Corrigido | Irmão adjacente esquecido |
|---|---|---|
| 1, item 4 | `onBackdropClick` removido no evento `close` | `closeBtn`, duas linhas acima, ficou com `{ once: true }` |
| 2, item 5 | `modalTitle` resetado em três caminhos | `modalMeta`, linha de baixo do mesmo template, em nenhum |
| 3 | — | o próprio `modalMeta`, achado só na terceira passada |

São +960/-101 linhas em 22 arquivos. Nem o implementador nem as três revisões
varreram o diff **inteiro** procurando especificamente esse padrão — as
revisões leram por eixo (Standards, Spec), não por formato de defeito. A
segunda revisão passou por cima do `modalMeta` sem ver: o ponto cego é dos
dois lados.

Varra `git diff 40a0d01..a11y-001` caçando um formato só:

**Uma mudança aplicada a um membro de um par ou conjunto simétrico, e não ao
resto.** Candidatos a par neste diff:

- Listener registrado num caminho e removido em outro, ou removido num
  caminho de saída e não nos demais.
- Elemento movido para o template estático que agora precisa de reset manual
  — quantos foram movidos, quantos ganharam reset, em quantos dos caminhos de
  saída da função.
- Regra CSS corrigida no tema claro e não no escuro, ou vice-versa (o próprio
  ticket já achou dois desses; confira se sobrou algum).
- Classe duplicada entre dois arquivos CSS, corrigida num só
  (`.btn-section-action--success` é o caso conhecido — procure outros).
- `div` virado em `<button>`/`<a>` com reset de estilo (`display`,
  `text-align`, `text-decoration`, `color`) aplicado a uma conversão e não à
  outra.
- `aria-label` adicionado a um controle de um grupo e não aos irmãos.
- Asserção de teste reforçada num caso e deixada fraca no caso gêmeo.

Rode contra a branch **antes do merge** se der — assim um achado ainda entra
na volta corrente do `A11Y-001` em vez de virar ticket novo. Depois do merge o
`git diff 40a0d01..<merge>` continua valendo; só fica mais caro consertar.

#### Acceptance criteria

1. Os 22 arquivos do diff foram percorridos, e o relatório diz quais foram
   lidos por inteiro e quais em parte (formato do
   `docs/audits/2026-09-09-40a0d01.md`).
2. Cada achado nomeia o par: o que foi corrigido, qual o irmão, e por que o
   irmão importa — ou não importa, se a assimetria for deliberada.
3. Cada achado diz se é regressão introduzida pela branch ou pré-existente.
   Pré-existente não é retrabalho do `A11Y-001`.
4. O relatório declara explicitamente se **nada** foi achado em cada categoria
   varrida. Uma varredura sem achados é resultado, e precisa ser legível como
   tal.
5. Nenhum arquivo de código foi alterado (`git status` limpo fora de
   `docs/audits/`).

#### Verification

```text
git diff --stat 40a0d01..a11y-001
```

```text
git status --short
```

## Comments

### 2026-09-10 — origem

Aberto na terceira revisão do `A11Y-001`, a pedido do autor. A discussão foi
se o implementador da etapa 2 deveria trocar de modelo. Conclusão: não — as
correções dele estavam todas certas, o que falhou foi atenção a caso simétrico
adjacente, que responde a effort e a passo mecânico no handoff (adicionado ao
`A11Y-001-rework-3.md`). Modelo bom rende mais aqui, nesta varredura, do que
no conserto de uma linha.

### 2026-09-10 — implementação concluída

Relatório publicado em
`docs/audits/2026-09-10-a11y-001-simetria.md`. Os 22 arquivos do snapshot de
código (`40a0d01..173a634`) foram percorridos; o diff do nome de branch tem um
23º arquivo porque passou a incluir a própria `QA-007` depois daquele
snapshot.

Quatro achados introduzidos pela branch foram registrados no fim de
`A11Y-001`. Os dois achados pré-existentes viraram `A11Y-002` e `A11Y-003`.
Dois probes E2E descartáveis confirmaram o falso verde de `:focus-visible`, as
métricas tipográficas do botão de notícia e as violações sérias de contraste
do modal aberto; ambos foram removidos depois da execução.

Verificação: `git diff --stat 40a0d01..a11y-001`; `git status --short`, sem
arquivo de código alterado pela QA-007.

### 2026-09-10 — revisão (etapa 3)

Aprovado. Os cinco critérios de aceite estão cumpridos e os achados foram
conferidos contra o código, não contra o relatório:

- `git diff --stat 40a0d01..173a634` bate exato com o declarado: 22 arquivos,
  `+937/-100`.
- Achados 1, 2, 3, 4 e 5 confirmados nos arquivos e linhas citados.
- Achados 7 e 8: as razões de contraste `2,55:1` e `1,50:1` foram recalculadas
  a partir do sRGB e conferem no dígito. Nenhuma das duas regras é tocada pelo
  diff da branch, então a classificação de pré-existente está certa.
- AC5: `git status` limpo fora de `.scratch/` e `docs/audits/`.

Uma categoria ficou com achado faltando — registrado na seção `## Revisão` do
relatório e encaminhado ao `A11Y-003`: `.back-link` está definida em
`settings.css` e em `sync-selection.css` com valores divergentes, e o
`:hover` (`color: #333`, só na cópia da sync-selection) vale nas duas telas.
No tema escuro isso dá cerca de `1,4:1` no link de voltar do settings. É o
mesmo formato do `.btn-section-action--success` que o ticket citou como caso
conhecido. A varredura de classe duplicada rodou com filtro "classe alterada
pela branch", enquanto a varredura de cor rodou sem esse filtro; a assimetria
entre os dois filtros é o que abriu a brecha.

Ressalvas menores, todas registradas no relatório: o roteamento do item 4 para
o `A11Y-002` não explica por que difere dos itens 3 e 5; o item 1 é o único
sem sintoma observável e não deve segurar o retrabalho antes do item 2; e o
probe fala em dois `span` de `#modalMeta`, mas a fixture E2E tem
`notification: ''`, que renderiza um.
