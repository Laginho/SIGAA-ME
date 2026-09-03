# PIPE-006 — Bloquear novos segredos no CI
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado e verificado em 2026-08-09

- Status: `DONE` — implementado e verificado em 2026-08-09
- Priority: `P1`
- Owner: Codex
- Dependencies: none
- Primary files: `.github/workflows/quality.yml`

#### Problem

A regra de ESLint do `SEC-000` só reconhece o padrão específico de credencial em
fallback. Nada no CI detectava uma credencial genérica adicionada em outro
formato ou arquivo.

#### Fix

Adicionado o job separado `secrets`, em `ubuntu-latest`, com teto de 10 minutos,
checkout de histórico completo (`fetch-depth: 0`) e
`gitleaks/gitleaks-action@v2`. A action usa o `GITHUB_TOKEN` efêmero do próprio
run. Nenhuma licença adicional foi necessária para a conta individual
`Laginho`.

#### Acceptance criteria

- O scanner executa em push e pull request sem credencial externa.
- Um novo token detectável deixa o workflow vermelho.
- O resultado e o limite da primeira execução estão registrados no `SEC-000`.

#### Verification

1. Run-base
   [`31322967979`](https://github.com/Laginho/SIGAA-ME/actions/runs/31322967979),
   commit descartável `4a149b6`: os três jobs passaram e o Gitleaks informou
   `no leaks found`.
2. Mutação
   [`31323088727`](https://github.com/Laginho/SIGAA-ME/actions/runs/31323088727),
   commit descartável `4860c95`: gate e E2E passaram; o scanner falhou com dois
   achados (`generic-api-key` e `github-pat`) no arquivo falso
   `tests/fixtures/pipe-006-fake-secret.ts`. O workflow concluiu com `failure`.
3. O branch `codex/pipe-006-proof` foi removido depois da prova.

#### Divergência da especificação

A primeira execução deveria ficar vermelha por causa da credencial antiga do
`SEC-000`, mas ficou verde. O log mostra que `gitleaks-action@v2` acrescentou
`--log-opts=-1`, analisando apenas o commit mais recente nesse evento `push`.
Assim, `fetch-depth: 0` disponibiliza o histórico, mas não ordena uma auditoria
integral. Não foi adicionada uma flag não especificada para mudar esse
comportamento. O `PIPE-006` fecha a prevenção de novos segredos; a remoção do
segredo antigo continua sendo o `git filter-repo` do Bruno.

Decisão do arquiteto em 2026-08-09: manter assim. Guarda do futuro roda em todo
push; auditoria do passado roda uma vez, manualmente, junto do `filter-repo`.
Fazer o CI reauditar o histórico antes da limpeza deixaria o gate
permanentemente vermelho e ensinaria o projeto a ignorá-lo.

#### Implementation notes

- Commit da implementação: `30dcbcd`
- Os commits `4a149b6` e `4860c95` existiram apenas no branch descartável.
- Nenhum valor de segredo real foi exibido ou registrado.
