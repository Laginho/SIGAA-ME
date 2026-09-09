# Issue tracker: `.scratch/` (markdown local, IDs estilo Jira)

## Layout

- Um diretório por esforço, numerado em sequência: `.scratch/NN-slug/`
  (as fases antigas `01-fase0-…` a `06-…` seguem o mesmo formato).
- `spec.md`: a saída de `to-spec`.
- `ledger.md`: tabela `| Data | ID | Commit |` dos tickets fechados.
- `issues/NN-ID-slug.md`: um arquivo por ticket, `NN` em ordem de dependência.

## ID

`PREFIXO-NNN`, único no repositório e imutável — é o endereço que ledger,
mensagem de commit e bloco de revisão citam. Prefixos em uso: `A11Y ARCH BUG
CLEAN CONC DATA DEP DEV DL DOC DÉBITO OBS PIPE PORTAL PROC QA REL SEC` —
reutilize antes de criar outro. Número = maior existente para o prefixo em
**todo** o `.scratch/` + 1:

    grep -rhoE 'BUG-[0-9]+' .scratch | sort -t- -k2 -n | tail -1

## Cabeçalho do ticket

    # ID: título
    Status: open | claimed | resolved | blocked
    Stage: to-implement | implementing | to-review | reviewing | to-merge | done | blocked
    Blocked by: ID, ID   (ou "nenhum")

Dois eixos, nunca dobrados num campo só. `Status:` é triagem e é deste
documento: `open` = pronto para agente. `Stage:` é a posição no loop de build e
pertence à skill `ticket-flow` — ela define os valores, as transições e em qual
commit cada uma entra; nenhuma etapa muda de `Stage` sem commit. `Status: open`
com `Stage: reviewing` é coerente.

Corpo: "What to build", critérios de aceite numerados, `Primary files` (o
limite do que a etapa 2 pode tocar) e as seções que o `to-tickets` já gera.
Comentários e motivo de `blocked` vão ao fim sob `## Comments`.

## Operações

- **Publicar** (`to-spec`, `to-tickets`): criar o diretório se preciso, escrever
  os arquivos acima.
- **Buscar um ticket**: o usuário passa o ID; `grep -rl 'ID' .scratch/*/issues`.
- **Fechar**: `Status: resolved`, `Stage: done` e uma linha no `ledger.md` com o
  hash — no mesmo commit.
