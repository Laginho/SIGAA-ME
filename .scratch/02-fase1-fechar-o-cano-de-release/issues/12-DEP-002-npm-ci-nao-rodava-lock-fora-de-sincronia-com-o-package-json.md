# DEP-002 — `npm ci` não rodava: lock fora de sincronia com o `package.json`
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — implementado e verificado no Windows em 2026-08-09

- Status: `DONE` — implementado e verificado no Windows em 2026-08-09
- Priority: `P1` — degradação de reprodutibilidade resolvida; ver nota histórica
  de 2026-08-05 no fim desta tarefa
- Owner: Bruno + Codex (execução no Windows)
- Dependencies: none
- Primary files: `package-lock.json`, `package.json`,
  `.github/workflows/quality.yml`, `.github/workflows/release.yml`, `CLAUDE.md`

#### Problem

Descoberto na sessão 2026-08-05, ao montar o ambiente do gate num Linux:
`npm ci` falha porque o lock não descreve a árvore que o `package.json` pede.
`vitest@4.1.4` exige `vite@^6 || ^7 || ^8`; o lock tem `vite@5.4.21`.

Isso não é problema de plataforma — **quebra em qualquer máquina, inclusive no
Windows**. A consequência prática é dupla:

1. `PIPE-003` não pode usar `npm ci`, que é o comando que existe justamente para
   dar instalação reproduzível no CI. Com `npm install` o CI resolve versões por
   conta própria e deixa de testar o que o lock descreve.
2. As versões instaladas divergem do lock. Foi assim que uma execução de agente
   acusou erros de tipo do `axios` que **não existem** no repositório real —
   sinal falso vindo de árvore diferente.

#### Acceptance criteria

- `npm ci` completa numa árvore limpa.
- `npm run quality` passa depois dele, no Windows.
- O lock commitado corresponde ao `package.json` (`vite` numa major que o
  `vitest` aceite).

#### Fix (2026-08-09)

- Vite `5.4.21` → `6.4.3`, a menor major aceita pelo Vitest `4.1.4`.
- Os plugins instalados `vite-plugin-electron@0.28.8` e
  `vite-plugin-electron-renderer@0.14.6` não declaram peer range de Vite; não foi
  necessária uma migração dos plugins para suas majors novas.
- Lock regenerado no Windows e os três passos de instalação dos workflows
  trocados de `npm install` para `npm ci`.
- `CLAUDE.md` atualizado para tratar `npm ci` como caminho autoritativo.

#### Verification (Windows)

| Comando | Resultado |
|---|---|
| `npm ci` | Pass — 675 pacotes instalados a partir do lock |
| `npm ls` | Pass — árvore válida, sem peer inválido |
| `npm run quality` | Pass — typecheck limpo, lint 0 erros/123 avisos, 64 passed/4 skipped |
| `npm run build` | Pass — Vite 6.4.3 compilou renderer/main/preload; NSIS e portátil gerados |
| `npm audit --omit=dev` | 5 high, 0 critical — registrado para `DEP-001` |
| `npm audit` | 18 total: 1 low, 15 high, 2 critical — registrado para `DEP-001` |

Artefatos gerados:

- `release/1.1.0-beta.2/SIGAA-ME-Windows-1.1.0-beta.2-Setup.exe`
- `release/1.1.0-beta.2/SIGAA-ME-Windows-1.1.0-beta.2-Portable.exe`

#### Remaining risk

O lock agora é reproduzível, mas isso não torna as dependências seguras. A
auditoria de produção ainda aponta `axios`, `electron-updater` e três transitivas
com severidade alta. Correção de vulnerabilidades e atualização de Electron
continuam no `DEP-001`; não foram misturadas nesta migração de build.

#### Implementation notes

- Commit: —
- Decisão: menor major compatível (`vite@6.4.3`), sem atualizar os plugins
  Electron junto.

#### Rationale

Sem `npm ci` o CI não é reproduzível, e um gate não reproduzível reprova PRs bons
e aprova ruins sem padrão discernível. Fica com o autor porque mexer em `vite`
major toca o build do Electron, e build é Windows.

#### Correção de 2026-08-05: bloqueio → degradação

Escrito antes como "bloqueia o `PIPE-003`". Errado, e o erro foi meu: eu não
tinha listado `.github/` e não vi que o `quality.yml` já existia. Ele resolve o
problema com `npm install` e um comentário apontando para esta tarefa.

A distinção importa: **o CI existe e roda**. O que falta é reprodutibilidade — o
CI instala uma árvore que pode não ser a do lock, então um verde no CI não prova
que a árvore do autor está verde, nem o contrário. É degradação silenciosa, que é
pior que bloqueio ruidoso, mas não impede a Fase 1 de fechar.
