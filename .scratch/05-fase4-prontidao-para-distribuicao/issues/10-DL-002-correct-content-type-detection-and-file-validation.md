# DL-002 — Correct content-type detection and file validation
Status: resolved
Priority: P2
Blocked by: —
Tracker status at migration: `NOT STARTED`

- Owner: —
- Dependencies: `DL-001`
- Primary files:
  - New: `electron/services/file-validation.service.ts`
  - `electron/services/http-scraper.service.ts`
  - `electron/services/download.service.ts`
  - New: `tests/unit/file-validation.test.ts`
  - New: `tests/integration/download-boundary.test.ts`

#### Required behavior

- Remove the unknown-to-PDF fallback.
- Resolve type from safe existing extension, Content-Disposition, known MIME,
  and magic bytes in that order.
- Use `.bin` or no extension when content genuinely remains unknown.
- Always reject HTML/login/error pages.
- Reject known extensions with incompatible signatures.
- Do not reject legitimate unknown binary data solely because no signature is
  registered.
- Set maximum response size and streamed-byte limits.
- Share validation logic between HTTP and Playwright download paths.

#### Acceptance criteria

- Valid octet-stream non-PDF fixtures survive validation.
- HTML masquerading as PDF is rejected and the temporary file is removed.
- Known Office/archive/image signatures are recognized.
- Failed downloads leave no partial final file.

#### Verification

```text
npx vitest run tests/unit/file-validation.test.ts tests/integration/download-boundary.test.ts tests/integration/download-real.test.ts
```

#### Implementation notes

- Commits: `2d65032` (testes), `70fcb4b` (implementação), + correção da revisão.
- Supported signatures: `.pdf`; `.zip/.docx/.xlsx/.pptx/.odt/.ods/.odp` (PK);
  `.doc/.xls/.ppt` (OLE); `.png`; `.jpg/.jpeg`; `.gif`; `.rar`; `.7z`; `.gz`.
- Maximum size: `MAX_DOWNLOAD_BYTES = 500 MiB`, importado do módulo pelos dois
  caminhos. O HTTP recusa por `Content-Length` antes de criar o `.part` e aborta
  o stream quando os bytes recebidos passam do teto; o Playwright entrega o
  arquivo inteiro via `saveAs`, então só pode checar depois de gravado.

---

## Releitura (2026-09-07, especificação)

O `BUG-001` (`700de9a`) fechou parte do que está acima, só no caminho HTTP:
fallback `.pdf` removido, `.part` + rename, extensão pelo conteúdo, assinatura
incompatível rejeitada, binário sem assinatura aceito. O que continua aberto:

1. **Caminho Playwright** (`download.service.ts`) não mudou. Ainda força
   `.html → .pdf` em três lugares, e "valida" lendo o arquivo inteiro se
   tiver menos de 50 KB e apagando-o se o texto contiver `sigaa`, `<script`,
   `<html` ou `<!doctype html>`. Um `.txt` de avisos que mencione o SIGAA é
   baixado e deletado. O mesmo `includes('sigaa')` roda sobre arquivo **já
   existente** no destino (`checkAndClearCorruptFile`) antes de baixar, e
   apaga arquivo legítimo do usuário.
2. **Nada é compartilhado.** A tabela de assinaturas e a verificação são
   membros privados de `HttpScraperService`; o Playwright não tem como usar.
3. **Sem limite de tamanho.** Nenhum dos dois caminhos limita `Content-Length`
   nem bytes recebidos. Uma resposta chunked sem fim enche o disco.
4. **Detecção de HTML frágil.** `readHead` lê 8 bytes e testa
   `trim().startsWith('<html'|'<!doc')`. Uma página com quatro ou mais
   caracteres de espaço na frente, ou com prólogo `<?xml ...?>`, passa como
   binário legítimo quando não há dica de extensão.
5. **Assinaturas de Office/arquivo.** Falta OLE (`.doc/.xls/.ppt`),
   OpenDocument (`.odt/.ods/.odp`, mesma assinatura PK), `.7z`, `.gz`.
6. **Ordem da cadeia.** Extensão de `Content-Disposition` é aplicada mesmo
   quando o nome da UI já tem uma (`Aula.docx` + `filename="x.zip"` →
   `Aula.docx.zip`). `.html/.htm` vindo de header, MIME ou
   `suggestedFilename` é aceito como tipo, quando é artefato do redirect JSF.

`DL-001` está resolvido (`8be340f`, `d759d16`, `a0c04b6`); o bloqueio saiu.

### Contrato

Módulo novo `electron/services/file-validation.service.ts`, sem estado, usado
pelos dois caminhos. Os testes importam exatamente estes nomes:

```ts
export const MAX_DOWNLOAD_BYTES: number   // teto de bytes por arquivo; um `ponytail:` diz o porquê do valor

/** Nome sugerido pelo servidor, ou `undefined`. Aceita `filename=`, `filename="..."` e `filename*=UTF-8''...` (percent-decoded). */
export function fileNameFromContentDisposition(header: string | undefined): string | undefined

/**
 * Nome final do arquivo, com extensão acrescentada só quando `fileName` não tem uma.
 * Ordem: extensão existente → `hintFileName` (Content-Disposition ou suggestedFilename) → MIME → assinatura.
 * - "Tem extensão" = `path.extname` casa `/^\.[a-z0-9]{1,10}$/i` com ao menos uma letra. `Aula 1.5` não tem; `.7z` tem.
 * - Extensão vinda de dica/MIME é ignorada quando não casa a mesma regra, ou quando é `.html`/`.htm`
 *   (artefato do redirect JSF: o conteúdo decide). `application/octet-stream` (`bin`) também é ignorado.
 * - Assinatura sem dica: `.pdf .png .jpg .gif .rar .7z .gz .zip`, nessa ordem; PK vira `.zip`, OLE não vira nada.
 * - Sem nada: devolve `fileName` como veio, sem `.bin`.
 */
export function resolveFileName(input: { fileName: string; hintFileName?: string; contentType?: string; head: Buffer }): string

/**
 * `ext` com assinatura conhecida e bytes incompatíveis → `signature-mismatch`.
 * Conteúdo HTML → `html`, qualquer que seja `ext`. HTML = depois de BOM e espaços opcionais, e de um
 * prólogo `<?xml ... ?>` opcional, o texto começa com `<!doctype` ou `<html` (sem caixa).
 * Extensão sem assinatura registrada passa; `head` menor que a assinatura passa se for prefixo.
 */
export function validateHead(head: Buffer, ext: string): { ok: true } | { ok: false; reason: 'html' | 'signature-mismatch' }

/**
 * Fecha um download: lê a cabeça de `partPath`, resolve o nome, valida, e renomeia para `dir/<nome>`.
 * Em qualquer falha o `.part` é removido. `too-large` quando o tamanho passa de `MAX_DOWNLOAD_BYTES`.
 * `session-expired` = HTML cujo texto (primeiros 64 KiB) contém `ViewExpiredException` ou `expira` (sem caixa).
 * Nome inválido (`sanitizeSegment` lança, ou sai de `dir`) → remove o `.part` e propaga o erro.
 */
export function finalizeDownload(input: { partPath: string; dir: string; fileName: string; hintFileName?: string; contentType?: string }):
  Promise<{ ok: true; filePath: string } | { ok: false; reason: 'html' | 'session-expired' | 'signature-mismatch' | 'too-large'; error: string }>
```

Assinaturas (prefixo hex): `.pdf 25504446`; `.zip .docx .xlsx .pptx .odt .ods .odp`
`504B0304|504B0506|504B0708`; `.doc .xls .ppt D0CF11E0A1B11AE1`; `.png 89504E47`;
`.jpg .jpeg FFD8FF`; `.gif 47494638`; `.rar 52617221`; `.7z 377ABCAF271C`; `.gz 1F8B`.

### O que muda em cada caminho

- `http-scraper.service.ts`: `SIGNATURES`, `DETECT_ORDER`, `readHead`, `detectExtension` e
  `verifyHead` saem da classe. `downloadFile` extrai o nome sugerido com
  `fileNameFromContentDisposition`, rejeita antes de criar o `.part` quando
  `Content-Length > MAX_DOWNLOAD_BYTES` (e destrói o stream), aborta o stream quando os bytes
  recebidos passam do teto, e no `finish` chama `finalizeDownload`. Importa a constante do módulo, não
  copia o número: o teste de integração substitui o módulo com um teto pequeno.
- `download.service.ts`: `saveAs(fullPath + '.part')` e depois `finalizeDownload` com
  `hintFileName = download.suggestedFilename()` e `contentType = detectedContentType`, nos três
  ramos (download, popup, popup+reload). Os três blocos de "JSF Error Page Detection" e todo
  `'.pdf'` literal saem. `reason === 'session-expired'` vira `throw new Error('JSF_SESSION_EXPIRED')`,
  que é o sinal que `PlaywrightLoginService.downloadFile` já usa para tentar de novo.
  `checkAndClearCorruptFile` decide por `readHead` + `validateHead`, não por `includes('sigaa')`;
  arquivo existente que passa é reaproveitado sem baixar.
- Limites: implementador não edita teste. `download-real.test.ts` (BUG-001/DL-001) continua verde
  sem alteração.

### Critérios de aceite (testes)

- `tests/unit/file-validation.test.ts` — cadeia de resolução, regras de HTML, assinaturas,
  `finalizeDownload` em `mkdtemp` real.
- `tests/integration/download-boundary.test.ts` — `HttpScraperService.downloadFile` com `axios`
  mockado (limites de tamanho) e `DownloadService.downloadFile` com um `Page` falso (sem `.pdf`
  forçado, `.txt` que menciona SIGAA sobrevive, HTML rejeitado, sessão expirada propaga,
  arquivo existente preservado). `MAX_DOWNLOAD_BYTES` mockado para 4096 no arquivo inteiro.
- `tests/integration/download-real.test.ts` — inalterado e verde.

---

## Revisão (2026-09-07)

Um achado, corrigido nesta branch.

**`resolveFileName` batizava resposta vazia de `.pdf`.** `extensionFromSignature`
usava o mesmo `sigMatches` do `validateHead`, que aceita a cabeça como PREFIXO da
assinatura — regra certa para validar (não rejeitar arquivo curto legítimo), errada
para nomear: cabeça vazia é prefixo de todas, e `.pdf` é o primeiro do
`DETECT_ORDER`. Um 200 com corpo vazio virava `LISTA 1.pdf` e era reportado como
sucesso — a mesma classe de chute que o `BUG-001` arrancou. Nomear passou a exigir
a assinatura inteira; `validateHead` continua aceitando prefixo.

Verificado nos outros pontos, sem achado: os três ramos do Playwright removem o
`.part` e fecham o popup em toda falha; `session-expired` continua chegando ao
`playwright-login.service.ts` como `JSF_SESSION_EXPIRED` e disparando a nova
tentativa; o antigo erro "servidor retornou", que era lançado, agora vira
`{ success: false }` — o `catch` externo já convertia os dois no mesmo retorno,
então nenhum chamador muda; o `.part` do caminho HTTP é removido pelo
`finalizeDownload` em toda falha pós-download.

Desvio consciente do contrato: os ramos de popup não passam `contentType`. O
`route` que preenche `detectedContentType` está na `page`, não no popup, então o
valor ali seria de outra resposta. Sem ele, dica e assinatura decidem.
