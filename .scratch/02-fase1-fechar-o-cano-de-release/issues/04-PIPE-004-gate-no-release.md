# PIPE-004 — Gate no release
Status: resolved
Priority: P0
Tracker status at migration: `DONE` — implementado na sessão 2026-08-05

- Owner: Claude
- Dependencies: `PIPE-002`, `PIPE-003`
- Primary files: `.github/workflows/release.yml`

#### Acceptance criteria

- Jobs encadeados por `needs`: `quality` → `build` → `publish`.
- É impossível publicar com teste falhando.
- Checksums SHA-256 gerados no release (ver `REL-001` revisado).

#### Implementation notes (2026-08-05)

Atendido, mas **não** com `needs:` entre jobs — o GitHub não permite depender de
um job de outro workflow, e o gate vive no `quality.yml`. O gate roda como passos
dentro do próprio job de release, antes do build: `typecheck` → `lint` → `test` →
`Build` → `Publish` (condicional). Falha em qualquer um interrompe o job, então
não existe binário nem release.

Custo aceito: os três comandos aparecem em dois arquivos. A alternativa
(`workflow_call` reutilizável) é mais máquina do que este projeto precisa hoje —
e a duplicação aqui é de *invocação*, não de *definição*: os dois chamam os
mesmos scripts do `package.json`, que continuam sendo a única descrição do gate.
Se algum dia o gate mudar de forma, muda no `package.json`.

O passo `Publish` empacota uma segunda vez (~1-2 min a mais), e isso está
comentado no YAML: a alternativa era repetir os passos do script `release` dentro
do workflow, criando duas descrições do build que podem divergir.

**Não atendido:** checksums SHA-256. Continua no `REL-001`.
