# DEP-003: Subir o axios para fora da faixa vulnerável
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum

- Owner: —
- Dependencies: nenhuma. Filho de `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`

#### What to build

`axios@^1.13.2` cai na faixa `1.0.0 - 1.17.0` do `npm audit` (high). É a
única dependência de produção com achado; tudo o mais é devDependency ou
transitivo dela. Suba para a menor versão fora da faixa (`1.18.0` ou maior,
`npm view axios version` dava `1.20.0` em 2026-09-11) e regenere o lock no
Windows.

Não há teste unitário que fique vermelho antes e verde depois: a prova é a
saída de `npm audit --omit=dev` antes e depois, colada nas notas abaixo.

#### Acceptance criteria

1. `npm audit --omit=dev` sem high nem critical.
2. `npm ls axios` mostra uma só versão instalada.
3. `npm run quality` verde.
4. Lock regenerado com `npm install` no Windows, `npm ci` limpo depois.

#### Verification

```text
npm audit --omit=dev
npm ls axios
npm run quality
```

#### Implementation notes

- Commit: —
- Versão escolhida: —
- Audit antes/depois: —
