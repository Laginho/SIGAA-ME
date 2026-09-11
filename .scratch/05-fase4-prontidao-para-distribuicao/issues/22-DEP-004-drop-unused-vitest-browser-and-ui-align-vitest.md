# DEP-004: Remover @vitest/browser e @vitest/ui sem uso e alinhar o vitest
Status: open
Stage: to-implement
Priority: P1
Blocked by: nenhum

- Owner: —
- Dependencies: nenhuma. Filho de `DEP-001`.
- Primary files:
  - `package.json`
  - `package-lock.json`
  - `vitest.config.ts` (só se algo quebrar ao subir o patch)

#### What to build

`@vitest/browser` é o único achado **critical** do audit e não é referenciado
por nenhum config, script ou teste do repositório (`grep` em 2026-09-11 só
acha `package.json`, o lock e documentos históricos). `@vitest/ui` idem: não há
script `--ui`. Remova os dois em vez de atualizar.

Depois suba `vitest` para o último 4.x fora da faixa `2.1.0-beta.1 - 4.1.10`
(4.1.11 ou maior). **Não** suba para o 5.0.0: major fora do escopo deste
ticket, abra outro se quiser.

#### Acceptance criteria

1. `@vitest/browser` e `@vitest/ui` ausentes do `package.json` e do lock.
2. `npm audit` sem linhas `@vitest/*`, `vitest`, `@vitest/mocker`.
3. `npm ls` sem árvore de peers inválida.
4. `npm run quality` verde com a mesma contagem de testes de antes
   (registre antes/depois).

#### Verification

```text
npm ls
npm audit
npm run quality
```

#### Implementation notes

- Commit: —
- Versão do vitest: —
- Testes antes/depois: —
