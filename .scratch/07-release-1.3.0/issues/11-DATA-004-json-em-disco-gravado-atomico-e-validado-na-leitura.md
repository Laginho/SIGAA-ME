# DATA-004: JSON em disco gravado atômico e validado na leitura
Status: open
Stage: to-review
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
