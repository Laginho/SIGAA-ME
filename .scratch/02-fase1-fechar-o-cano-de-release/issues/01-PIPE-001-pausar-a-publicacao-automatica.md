# PIPE-001 — Pausar a publicação automática
Status: resolved
Priority: P0
Tracker status at migration: `DONE` — implementado na sessão 2026-08-05

- Status: `DONE` — implementado na sessão 2026-08-05
- Priority: `P0`
- Owner: Claude
- Dependencies: none
- Primary files: `.github/workflows/release.yml`, `package.json`

#### Problem

`npm run release` termina em `electron-builder --win --publish always`. A flag
publica **incondicionalmente**. Combinado com auto-update ativo, existe um
caminho sem freio entre "commitei uma tag" e "o app na máquina do usuário foi
substituído" — sem que teste algum tenha rodado.

#### Acceptance criteria

- Nenhum push de tag publica binário sem passo explícito.
- O build local segue funcionando sem alteração de fluxo para o autor.

#### Verification

Push de tag de teste não gera release publicado.

#### Implementation notes (2026-08-05)

Duas mudanças, e a segunda é a que importa:

1. `release.yml` perdeu o gatilho `push: tags: v*.*.*` e ficou só com
   `workflow_dispatch`, com um input booleano `publish` que **começa
   desmarcado**. Desmarcado, o workflow compila e sobe o instalador como
   artefato; marcado, publica no GitHub Releases.
2. O `package.json` trocou `--publish always` por `--publish never` no script
   `release`. A flag que substitui o app dos usuários passou a existir **só**
   dentro do `release.yml`.

Por que as duas: tirar só o gatilho deixaria `npm run release` publicando da
máquina do autor sem cerimônia. Tirar só a flag deixaria o push de tag rodando um
build inútil a cada versão. O caminho perigoso era a **combinação**
`release:patch` (que faz `git push --follow-tags`) + gatilho de tag + `always`.

`RELEASE_GUIDE.md` foi atualizado no mesmo commit — ele descrevia o fluxo antigo
("o push inicia o build"), e guia que mente sobre publicação é pior que guia
ausente.

**Passo manual necessário:** `.github/workflows/` é protegido contra escrita por
ferramenta remota (é a superfície com que um agente poderia se dar permissões no
CI). O `release.yml` foi **entregue no chat** e precisa ser salvo por cima do
arquivo à mão. Confirme o diff antes de commitar.
