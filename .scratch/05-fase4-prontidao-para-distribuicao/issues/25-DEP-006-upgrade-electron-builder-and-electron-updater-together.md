# DEP-006: Subir electron-builder e electron-updater juntos
Status: open
Stage: to-implement
Priority: P1
Blocked by: DEP-005

- Owner: —
- Dependencies: `DEP-005` (o builder empacota o Electron novo). Filho de
  `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `electron-builder.yml` ou a chave `build` do `package.json`, o que existir

#### What to build

`electron-builder@^24.13.3` está em `19.28.0 - 26.14.0` (high) e arrasta
`app-builder-lib`, `builder-util`, `dmg-builder`, `electron-publish`,
`electron-builder-squirrel-windows` e a maior parte dos transitivos do audit
(`tar` critical, `tmp`, `extract-zip`, `@xmldom/xmldom`, `js-yaml`).
`electron-updater@^6.8.3` está em `2.9.0 - 6.8.8`. Suba os dois de uma vez
para as versões pares fora da faixa (26.15.x+ e 6.8.9+ em 2026-09-11).

A prova real deste ticket é o instalador Windows. Sai do `npm run build` no
Windows, não do Linux.

#### Acceptance criteria

1. `npm audit` sem linhas `electron-builder*`, `electron-updater`,
   `app-builder-lib`, `builder-util*`, `tar`.
2. `npm ls` limpo.
3. `npm run build` gera o instalador Windows.
4. Instalador instalado e o app abre, faz login, navega e baixa um arquivo
   (smoke manual, uma vez, resultado nas notas).
5. Achados de audit que sobrarem depois deste ticket, listados por nome nas
   notas com "corrigido" ou "aceito porque …". Isso fecha a cláusula
   "documented or fixed" do `DEP-001`.

#### Verification

```text
npm ls
npm audit
npm run build
```

#### Implementation notes

- Commit: —
- Versões escolhidas: —
- Smoke do instalador: —
- Audit residual: —
