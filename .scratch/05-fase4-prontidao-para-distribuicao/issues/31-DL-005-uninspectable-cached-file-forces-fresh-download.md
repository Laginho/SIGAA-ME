# DL-005: Arquivo em cache que não dá para inspecionar é tratado como válido
Status: open
Stage: to-implement
Priority: P2
Blocked by: nenhum

- Primary files:
  - `electron/services/download.service.ts` (só `checkAndClearCorruptFile` dentro de `downloadFile`, `:70-86`)
  - New: `tests/unit/audit-download-inspect.test.ts`

Passo 4 da ordem recomendada de `docs/audits/2026-09-09-40a0d01.md`. Ficou fora
do handoff de 2026-09-11; cortado no mesmo dia. Está no `downloadFile` **vivo**
do fallback Playwright, não no lote morto do `CLEAN-003`.

#### What to build

`checkAndClearCorruptFile` lê a cabeça do arquivo já em disco para decidir se
reaproveita. Se a leitura ou a validação lançam (`EACCES`, arquivo travado,
`EIO`), o `catch` só loga e a função cai em `return true`: o download é dado
como concluído com um arquivo que ninguém conseguiu ler. Falha ao inspecionar
deve forçar download novo.

#### Acceptance criteria

1. Com `readHeadSync` lançando para o caminho existente, `checkAndClearCorruptFile`
   devolve `false` e o `downloadFile` segue para baixar de novo em vez de
   devolver o caminho antigo.
2. ❌ Comportamento com arquivo legível continua: cabeça válida reaproveita,
   cabeça inválida apaga e baixa.

#### Verification

    npx vitest run tests/unit/audit-download-inspect.test.ts
    npm run quality

## Tests stage 2 writes (own commit, red)

- `checkAndClearCorruptFile` é uma closure dentro de `downloadFile`. Se não
  houver seam para testar sem Playwright, extraí-la como função de módulo
  exportada é a menor mudança que abre o seam, e fica dentro do Primary file.
  Teste chama a função de produção com `fs` real em pasta temporária e um
  arquivo sem permissão de leitura, ou com `readHeadSync` mockado lançando.

#### Revisão (2026-09-11) — reaberta

Critério 1 ✅. O `return false` no `catch` é o passo 4 da ordem recomendada de
`docs/audits/2026-09-09-40a0d01.md`, uma linha, sem desvio. Vermelho-verde
refeito na revisão: com `download.service.ts` de `e42d4f2` (pré-correção) o
teste falha em `expect(result.success).toBe(false)` — recebido `true`; com a
correção, passa. Gate `npm run quality` verde: 52 arquivos, 636 passed, 4
skipped. Separação do `diff --stat` correta — `e42d4f2` toca só teste + ticket,
`1ca9b12` só fonte + ticket. Nada fora dos Primary files.

Critério 2 ❌, pela metade que não tem teste:

- "cabeça válida reaproveita" está coberto —
  `tests/integration/download-boundary.test.ts:199` pré-grava um arquivo no
  destino, chama o `downloadFile` de produção e prova que `saveAs` não foi
  chamado e o conteúdo antigo continua lá. Falharia se o reaproveitamento
  regredisse.
- "cabeça inválida apaga e baixa" **não tem teste em lugar nenhum**.
  `tests/unit/file-validation.test.ts` exercita `validateHead` isolado, nunca
  através de `checkAndClearCorruptFile`. Se o `fs.unlinkSync` + `return false`
  de `download.service.ts:77-81` virasse `return true`, a suíte inteira
  continuaria verde.

O que falta na volta à etapa 2: um caso que pré-grava no destino um arquivo com
assinatura inválida para a extensão, chama `downloadFile` de produção e prova
que o arquivo antigo sumiu e o download novo aconteceu. Cabe em
`tests/unit/audit-download-inspect.test.ts`, que já é Primary file — não precisa
ampliar o limite. Reaberto pela regra mecânica, não por tamanho: achado que
precisa de teste novo não é correção pequena de revisão.

Aceito sem mudança, registrado para não voltar como achado: o teste novo usa
`fs` real em pasta temporária em vez do `vi.mock` + `Map` que
`docs/agents/orchestration.md` documenta. O ponto do teste é um `EISDIR` de
verdade, que mock nenhum reproduz; o cabeçalho do arquivo já explica a escolha.

Achados fora do escopo deste ticket, encaminhados como comentário:

- `DL-004` — o filtro de duplicata do lote (`sigaa.service.ts:357-375`) pula
  por `existsSync` puro, sem validar conteúdo.
- `QA-001` — `tests/unit/sync-selection.test.ts:259` falhou uma vez na suíte
  completa e passou sozinho e na repetição.

## Comments
