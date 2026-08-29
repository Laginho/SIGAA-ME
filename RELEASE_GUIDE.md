# SIGAA-ME Release Guide

Use these commands to version the app, generate changelogs, and trigger the GitHub Actions build workflow.

## 🚀 Stable Releases
Use these when you are moving from a beta to a finished version, or bumping a stable version.

| Command | Result (from 1.1.0) | Description |
| :--- | :--- | :--- |
| `npm run release:patch` | `1.1.1` | Bug fixes and minor tweaks. |
| `npm run release:minor` | `1.2.0` | New features (like the Notification system). |
| `npm run release:major` | `2.0.0` | Breaking changes or massive UI overhauls. |

---

## 🧪 Beta Releases
Use these for testing new features before the official launch.

| Command | Result (from 1.1.0) | Description |
| :--- | :--- | :--- |
| `npm run release:patch:beta` | `1.1.1-beta.0` | Start/Bump a beta for a patch fix. |
| `npm run release:minor:beta` | `1.2.0-beta.0` | Start/Bump a beta for a new feature. |
| `npm run release:major:beta` | `2.0.0-beta.0` | Start/Bump a beta for a major version. |
| `npm run release:beta` | `1.2.0-beta.1` | Increments the existing beta (e.g. .0 -> .1). |

---

## 🛠️ How it works
1. **Automatic Versioning**: It updates `package.json`.
2. **Changelog**: It automatically appends to `CHANGELOG.md`.
3. **Git Tagging**: It creates a tag (e.g., `v1.2.0-beta.0`).
4. **Push**: The command pushes the commit and the tag to GitHub.

O push **não publica nada** — ver abaixo.

---

## 📦 Publicar é um segundo passo, manual

Mudou em 2026-08-05 (`PIPE-001`/`PIPE-004`). Antes, o push da tag disparava o
build e o `electron-builder` publicava incondicionalmente: um `npm run
release:patch` podia substituir o app dos usuários por auto-update sem que
nenhum teste tivesse rodado.

Agora o fluxo é:

1. `npm run release:patch` (ou a variante que você quer) — versiona, gera
   changelog, cria a tag e empurra.
2. GitHub → **Actions** → **Release SIGAA-ME** → **Run workflow**.
3. O workflow roda o gate (`typecheck`, `lint`, `test`) **antes** de compilar. Se
   algum falhar, não existe binário nem release.
4. A caixa **Publicar no GitHub Releases** decide o resto:
   - **desmarcada** (padrão): compila e guarda o instalador como artefato do
     workflow, para você baixar e testar. Nada vai para os usuários.
   - **marcada**: roda `electron-builder --publish always`, que cria a release
     no GitHub — mas como **rascunho (draft)**, porque
     `electron-builder.json5` tem `releaseType: "draft"`. Um rascunho é
     intencional: dá uma última checagem antes de qualquer usuário ver a
     versão.
5. A release marcada como "publish" ainda não chegou a ninguém. Vá em GitHub →
   **Releases** → abra o rascunho → confira os artefatos e o `latest.yml` →
   **Publish release**. Só a partir desse clique manual o `electron-updater`
   (que só enxerga releases **publicadas**, nunca rascunhos) passa a oferecer
   a versão para quem já tem o app instalado.

`npm run release` na sua máquina compila e **não** publica (`--publish never`).
A flag que publica existe só dentro do `release.yml`.

### Comportamento do cliente desde a tarefa `006`

O app não instala nada sem perguntar: ele confere por atualizações ao abrir,
pergunta antes de baixar (mostrando a versão) e pergunta de novo antes de
reiniciar para instalar. Ninguém recebe update silencioso — mesmo depois do
`Publish release` acima, cada usuário ainda precisa clicar "Baixar" e depois
"Reiniciar e Instalar".

> [!TIP]
> Always make sure your working directory is clean (`git status`) before running a release command!
