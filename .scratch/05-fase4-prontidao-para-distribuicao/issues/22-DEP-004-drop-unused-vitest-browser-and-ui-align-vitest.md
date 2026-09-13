# DEP-004: Remover @vitest/browser e @vitest/ui sem uso e alinhar o vitest
Status: resolved
Stage: done
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
acha `package.json`, o lock e documentos históricos). `@vitest/ui` só é usado
pelo script `test:ui` (`vitest --ui`), modo watch interativo que nunca entrou
em nenhum fluxo (`docs/PLANO.md:112`). Remova os dois pacotes e o script
`test:ui` em vez de atualizar. Correção de 2026-09-12: o texto original dizia
"não há script `--ui`", premissa errada que parou a attempt 1.

Depois suba `vitest` para o último 4.x fora da faixa `2.1.0-beta.1 - 4.1.10`
(4.1.11 ou maior). **Não** suba para o 5.0.0: major fora do escopo deste
ticket, abra outro se quiser.

#### Acceptance criteria

1. `@vitest/browser` e `@vitest/ui` ausentes do `package.json` e do lock, e o
   script `test:ui` removido do `package.json`.
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

- Commit: (a seguir, branch `dep-004`)
- Versão do vitest: 4.1.4 → 4.1.11 (`^4.1.11`); `@vitest/browser` e
  `@vitest/ui` removidos de `devDependencies`, script `test:ui` removido.
  `@vitest/ui` permanece só como peer opcional do próprio `vitest` (declarado
  em `peerDependenciesMeta` no lock, não instalado) — `npm ls @vitest/browser
  @vitest/ui` confirma árvore vazia.
- Testes antes/depois: 60 arquivos, 685 passed | 5 skipped (690) em ambos —
  nenhuma mudança de contagem.
- `npm audit`: sem nenhuma linha `vitest`/`@vitest/*` (18 vulnerabilidades
  remanescentes são de `electron-builder`/`undici`/outras, fora do escopo).
- Não editado (fora de Primary files): `docs/PLANO.md:112` ainda cita
  `test:ui` como script existente — ficou desatualizado por este ticket, mas
  não está nos Primary files. Deixo nota aqui em vez de editar.

#### Resolution (2026-09-13)

Aprovado na revisão de etapa 3 sem nenhuma mudança de código. Merge por PR #18
(`25ff364`), fast-forward de `b3812b1`.

**Critérios, um a um, verificados no Windows nesta branch:**

1. ✅ `@vitest/browser`, `@vitest/ui` e o script `test:ui` fora do
   `package.json`. O que resta no lock são as declarações de
   `peerDependencies`/`peerDependenciesMeta` dentro do manifesto do próprio
   `vitest` (`package-lock.json:9419-9470`), com `optional: true` — metadado,
   não pacote instalado. `npm explain @vitest/ui` não acha nada.
2. ✅ `npm audit` sem nenhuma linha `vitest`/`@vitest/*`. Restam 18
   vulnerabilidades (1 low, 16 high, 1 critical); a critical passou a ser
   `tar <=7.5.20` via `electron-builder`, fora do escopo.
3. ✅ `npm ls` limpo, 22 raízes, sem `UNMET`/`invalid`, `vitest@4.1.11`.
4. ✅ `npm run quality` verde: ESLint `0 errors, 55 warnings` (todos
   `no-explicit-any` preexistentes) e `Test Files 60 passed (60)`,
   `Tests 685 passed | 5 skipped (690)` em `RUN v4.1.11` — idêntico ao antes,
   como esperado, já que nenhum arquivo de teste foi tocado.

**Sem commit de teste, e está certo.** Remoção de dependência não tem seam para
testar; a prova do upgrade é a suíte inteira rodando em 4.1.11.

**Checagens extras do revisor:** o lock confere devDep a devDep com o
`package.json`, então o `npm ci` do CI resolve sem desvio; nada em `allowScripts`
mudou, porque o diff do lock só mexe na família vitest e nas transitivas que
saíram com ela (`@blazediff/core`, `@polka/url`, `fflate`, `mrmime`, `pngjs`,
`sirv`, `totalist`, `ws`) — `electron` e `esbuild` intactos. O `ws` saiu da
árvore e ninguém o pede (`npm explain ws` → nada): era transitiva do
`@vitest/browser`, e o `jsdom@29` não depende dele. CI verde nos três jobs.

**Sobre a nota de `docs/PLANO.md:112`:** conferido, não é achado. Aquela linha
está na seção "Achados que a auditoria original não registrou", um registro
datado de 2026-08-02, não uma descrição do estado atual dos scripts. Mesma
leitura para `CODE_REVIEW.md:139` e `docs/AUDITORIA_COMPLEXIDADE.md:43`.
