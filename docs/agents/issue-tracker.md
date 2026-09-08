# Issue tracker: `.scratch/` (markdown local, IDs estilo Jira)

## Layout

- Um diretório por esforço, numerado em sequência: `.scratch/NN-slug/`
  (as fases antigas `01-fase0-…` a `06-…` seguem o mesmo formato).
- `spec.md`: a saída de `to-spec`.
- `ledger.md`: tabela `| Data | ID | Commit |` dos tickets fechados.
- `issues/NN-ID-slug.md`: um arquivo por ticket, `NN` em ordem de dependência.

## ID

`PREFIXO-NNN`, único no repositório. Prefixos em uso: `BUG SEC PIPE QA DL ARCH
CLEAN DOC DEP` — reutilize antes de criar outro. Número = maior existente para
o prefixo em **todo** o `.scratch/` + 1:

    grep -rhoE 'BUG-[0-9]+' .scratch | sort -t- -k2 -n | tail -1

## Cabeçalho do ticket

    # ID: título
    Status: open | claimed | resolved | blocked
    Blocked by: ID, ID   (ou "nenhum")

`open` = pronto para agente. Corpo: "What to build", critérios de aceite,
seções que o `to-tickets` já gera. Comentários e motivo de `blocked` vão ao fim
sob `## Comments`.

## Operações

- **Publicar** (`to-spec`, `to-tickets`): criar o diretório se preciso, escrever
  os arquivos acima.
- **Buscar um ticket**: o usuário passa o ID; `grep -rl 'ID' .scratch/*/issues`.
- **Fechar**: `Status: resolved` e uma linha no `ledger.md` com o hash — no
  mesmo commit do PR.
