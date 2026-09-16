# DATA-004: JSON em disco gravado atômico e validado na leitura
Status: resolved
Stage: done
Priority: P2
Blocked by: nenhum
Review: agent

- Primary files:
  - New: `electron/services/atomic-write.ts` (um helper: `writeJsonAtomicSync(path, value)`)
  - `electron/services/persistence.service.ts` (credenciais `:127`, settings `:192`; `VALIDATORS.syncInterval` `:45`; loaders que engolem parse error)
  - `electron/services/cache.service.ts` (`:109`; loader)
  - `electron/services/portal-compatibility.service.ts` (`:99`; `readFromDisk`)
  - `tests/unit/audit-persistence.test.ts`
  - `tests/unit/persisted-schemas.test.ts`
  - `tests/unit/cache-service.test.ts`
  - `tests/unit/portal-compatibility.test.ts`
  - New: `tests/unit/atomic-write.test.ts`

Itens 6 e 19 do gabarito. Item 6: Opus e Astra; Fable negou e a verificação
mostrou que a negação estava errada. Item 19: Fable.

#### What to build

Item 6: `fs.writeFileSync` direto no arquivo vivo trunca antes de escrever;
crash ou queda de energia no meio deixa JSON inválido. A ordem
grava-depois-troca-memória do `DATA-003` protege a memória do processo, não o
disco. Os loaders engolem o parse error e o dado vira baseline vazio em
silêncio: settings no padrão, cache de "já visto" vazio (todo item vira novo no
próximo sync), compatibilidade `ok`.

Item 19: em disco `syncInterval` aceita qualquer número `> 0`; no IPC exige
inteiro 15..1440. `settings.json` editado com `0.001` vira `setInterval` de
60 ms (`background-sync.service.ts:36`).

#### Acceptance criteria

1. Um helper grava em `<arquivo>.tmp` no mesmo diretório e faz `renameSync`
   por cima do destino. Falha na escrita deixa o destino intacto e remove o
   `.tmp`; o erro propaga (os chamadores mantêm o tratamento do `DATA-003`).
2. Os quatro pontos de escrita (settings, credenciais, cache, compatibilidade)
   usam o helper. `diagnostics.service.ts` fica como está: dump descartável.
3. `VALIDATORS.syncInterval` em disco aplica a mesma regra do IPC (inteiro,
   15..1440); valor fora cai no padrão pelo caminho que o loader já usa para
   campo inválido.
4. JSON que não parseia em disco é logado (`warn`, nome do arquivo, sem
   conteúdo) antes de cair no padrão, nos três loaders.
5. `npm run quality` verde.

#### Verification

    npx vitest run tests/unit/atomic-write.test.ts tests/unit/persisted-schemas.test.ts tests/unit/audit-persistence.test.ts tests/unit/cache-service.test.ts tests/unit/portal-compatibility.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `tests/unit/atomic-write.test.ts` (diretório temporário real, sem espiar
  `fs`: ver Comments): sucesso substitui o conteúdo; escrita que lança (por
  exemplo, `.tmp` apontando para diretório inexistente) deixa o destino com o
  conteúdo anterior e nenhum `.tmp` para trás. Vermelho porque o módulo não
  existe.
- `tests/unit/persisted-schemas.test.ts`: `syncInterval: 0.001` e `1441` caem
  no padrão; `15` e `1440` passam. Vermelho para `0.001`.
- `tests/unit/audit-persistence.test.ts`, `cache-service.test.ts`,
  `portal-compatibility.test.ts`: arquivo com JSON truncado → valor padrão e
  um `warn` com o nome do arquivo. Vermelho pelo `warn`.

## Comments

- `vi.spyOn(fs, 'writeFileSync')` não funciona no Vitest 4 (namespace ESM).
  Use diretório temporário real ou espie `fs.promises`. Truque de arquivo
  somente leitura também não serve no Windows.
- `renameSync` por cima de arquivo existente substitui no Windows (Node usa
  `MoveFileEx` com replace). Não precisa de `unlink` antes.

#### Resolution (2026-09-15)

Verdict: Approve

Commits: `7ee28c1` (testes, vermelho), `3518036` (helper), `77e7013` (os
quatro pontos de escrita + validador + warns), merge `35c6d46`.

Critérios, um a um:

1. ✅ `electron/services/atomic-write.ts` grava `<path>.tmp` e faz
   `renameSync`. Falha no `writeFileSync` remove o `.tmp` e relança —
   os chamadores mantêm o tratamento do `DATA-003`.
2. ✅ Os quatro pontos usam o helper (`persistence.service.ts` settings e
   credenciais, `cache.service.ts`, `portal-compatibility.service.ts`).
   `grep -rn writeFileSync electron/` só devolve o helper e o
   `diagnostics.service.ts`, que o ticket manda deixar como está.
3. ✅ `VALIDATORS.syncInterval` agora é `isFiniteNumber && Number.isInteger
   && >= 15 && <= 1440` — idêntico a `electron/ipc/validation.ts:144`. As
   quatro opções da UI (15/30/60/120) continuam válidas.
4. ✅ `warn` com `{ file: '<nome>.json' }` e sem conteúdo nos três loaders,
   antes do padrão.
5. ✅ `npm run quality`: tsc limpo, ESLint 0 erros / 52 warnings
   (`no-explicit-any` pré-existentes), vitest **68 arquivos, 759 passando,
   5 skipped**.

Prova vermelho-verde: em `7ee28c1` (só testes) os cinco arquivos da
verificação falham — 5 failed files, 4 failed / 40 passed; o
`atomic-write.test.ts` nem coleta, porque o módulo ainda não existe. Em
`77e7013` a suíte inteira passa.

Dois registros, nenhum bloqueante:

- O commit de teste mexeu em três arquivos fora de Primary files
  (`tests/integration/dev-cache-mutation-boundary.test.ts`,
  `tests/integration/persistence-auth-recovery.test.ts`,
  `tests/unit/userdata-late-binding.test.ts`). São mocks de `fs` com
  factory explícita: sem `renameSync`/`unlinkSync` eles quebrariam. Ajuste
  mecânico forçado pela implementação, não ampliação de escopo — nenhum
  arquivo de produção saiu do limite.
- **Resíduo:** o helper não faz `fsync` no `.tmp` antes do `rename`. O
  rename é atômico no namespace, então crash de processo está coberto; em
  queda de energia o conteúdo pode não ter chegado ao disco e o destino
  fica truncado sob o nome bom. O critério 1 não pede `fsync` e foi
  cumprido como escrito, mas a motivação do ticket cita queda de energia.
  Fechar isso é ticket novo (precisa de teste novo).
