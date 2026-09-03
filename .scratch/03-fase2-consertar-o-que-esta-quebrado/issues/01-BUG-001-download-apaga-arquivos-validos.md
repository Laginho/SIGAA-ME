# BUG-001 — Download apaga arquivos válidos
Status: resolved
Priority: P0
Tracker status at migration: `DONE` — 2026-08-09, commit `700de9a`

- Status: `DONE` — 2026-08-09, commit `700de9a`
- Priority: `P0` (**promovido** de P2 no review original)
- Owner: Claude (sessão 2026-08-09)
- Dependencies: `PIPE-002`
- Primary files: `electron/services/http-scraper.service.ts`,
  `tests/integration/download-real.test.ts` (novo)

#### Problem

Cadeia confirmada:

1. linha 918-922: sem extensão detectada → `detectedExtension = '.pdf'`
2. linha 926-927: extensão anexada ao nome
3. linha 956-958: valida magic bytes conforme extensão → procura `%PDF`
4. linha 960-965: falha → `fs.promises.unlink(filePath)`

Qualquer `.txt`, `.csv`, `.py`, `.odt` servido como `application/octet-stream` é
baixado e **imediatamente apagado**. O fallback inventa uma mentira sobre o tipo
e a validação seguinte pune o arquivo por ela.

**Por que é P0:** perda de dados no caminho principal do app.

#### Required behavior

- Remover o fallback para `.pdf`.
- Resolver tipo nesta ordem: extensão existente segura → `Content-Disposition` →
  MIME conhecido → magic bytes.
- Usar `.bin` ou sem extensão quando genuinamente desconhecido.
- Continuar rejeitando páginas HTML de login/erro.
- Não rejeitar binário legítimo apenas por não ter assinatura registrada.

#### TDD — esta tarefa é o exercício de ciclo vermelho-verde

Escrever **primeiro** o teste que baixa um `.txt` servido como `octet-stream` e
afirma que o arquivo sobrevive. Ele **deve falhar** antes da correção.

#### Acceptance criteria

- Fixture de octet-stream não-PDF sobrevive à validação.
- HTML disfarçado de PDF continua sendo rejeitado e o temporário é removido.
- Download falho não deixa arquivo final parcial.

#### Implementation notes (2026-08-09)

**A correção não foi apagar o fallback.** Apagar as cinco linhas do chute faria
o `.txt` sobreviver e faria **todo PDF voltar a cair sem extensão** — consertaria
o caso raro quebrando o comum. O fallback existia porque a maioria dos anexos de
um portal universitário é PDF e o SIGAA serve muitos deles como `octet-stream`
sem `Content-Disposition`. Ele acertou o problema; o defeito era o passo
seguinte tratar o palpite como fato.

A raiz: **o passo 1 inventava um tipo e o passo 6 punia a invenção.** Enquanto
os dois existissem, era uma contradição esperando o arquivo errado.

O que foi feito:

1. A extensão passa a ser **deduzida do conteúdo** (`detectExtension`), usando a
   mesma tabela de magic bytes que a verificação usa. Detecção e verificação
   leem os mesmos bytes, então não têm como se contradizer. `''` é resposta
   válida quando nenhuma assinatura casa — sem extensão é inconveniente, apagado
   é perda de dado.
2. A tabela `SIGNATURES` virou campo único da classe. Duas tabelas que precisam
   concordar é o padrão que já quebrou este repositório em `QA-005` e `BUG-007`.
3. O download grava em **`.part`** e só é renomeado depois de verificado. Isso é
   o que permite (1) — a extensão vem de bytes que só existem depois de gravados
   — e é o que atende o terceiro critério de aceitação: um download interrompido
   nunca deixa um arquivo com o nome final.
4. `verifyFileContent` foi dividida em `readHead` + `verifyHead`, para o arquivo
   ser lido uma vez só. Único chamador, refatoração contida.

**`.zip` vem por último na ordem de detecção**, de propósito: docx/xlsx/pptx têm
a mesma assinatura, então sem `Content-Disposition` não há como distinguir, e
`.zip` é a resposta honesta em vez de um chute entre os três.

#### Achado durante o teste do terceiro critério

`pipe()` **não propaga erro do source para o destino.** Se a conexão caísse no
meio do stream, o `writer` nunca emitia `finish` nem `error`, e a Promise do
`downloadFile` **nunca resolvia** — a UI ficava em "baixando" para sempre e o
parcial ficava no disco. Não era o `BUG-001`, mas está no mesmo bloco e cabe no
mesmo critério de aceitação, então foi corrigido junto: handler de `error` no
`response.data`, que destrói o writer, descarta o parcial e resolve.

#### Verification

Ciclo vermelho-verde, como o `PLANO.md` pedia para esta tarefa. O teste foi
escrito **antes** e falhou pelo motivo previsto — o log da execução vermelha
registra `Deleted invalid file: .../LISTA 1.pdf`.

`tests/integration/download-real.test.ts`, 6 testes, chamando o
`downloadFile` de produção com só o `axios` mockado:

| Teste | Critério |
|---|---|
| `.txt` como octet-stream sobrevive | 1 |
| PDF como octet-stream ganha `.pdf` pelo conteúdo | regressão do caso comum |
| extensão que já veio da UI é respeitada | regressão |
| HTML com `Content-Disposition: .pdf` é rejeitado, destino vazio | 2 |
| HTML sem `Content-Disposition` é rejeitado, destino vazio | 2 |
| conexão interrompida: sem arquivo e sem Promise pendurada | 3 |

**Prova por mutação** (regra 5 do `CLAUDE.md`), duas, em cópia descartável:

1. Devolver o chute (`this.detectExtension(head) || '.pdf'`) → **só** o primeiro
   teste fica vermelho. Os outros cinco continuam verdes, o que mostra que a
   asserção é específica.
2. Desligar o handler de erro do stream (`'error'` → `'erro-desligado'`) → o
   sexto teste estoura por timeout em 8s, que é exatamente a Promise nunca
   resolvendo.

Gate no container Linux (o Windows continua sendo a autoridade):

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npx eslint .` | 0 erros, **115 avisos** (eram 116 depois do `CLEAN-001`, 125 no início da sessão) |
| `npx vitest run` | **70 passed, 4 skipped** (eram 64 + 4) |

#### O que este trabalho NÃO fechou

- **`DL-001` (path containment) continua aberto.** O `.part` + rename é parte da
  mecânica que o `DL-001` pede, mas a validação estrutural com
  `path.resolve` + `path.relative` **não foi feita**. A única defesa contra
  traversal continua sendo a lista negra de caracteres.
- **`DL-002`** se sobrepõe a esta tarefa e precisa de releitura: parte do que ele
  descreve foi feito aqui.
- As fixtures de resposta são sintéticas. Isto prova que a lógica de tipo e
  verificação está correta contra as respostas que **assumimos** que o SIGAA dá.
  Gravar uma resposta real do portal é o passo que prova a suposição.

#### Fechamento

`npm run quality` rodado no Windows por Bruno, e commitado em `700de9a`.

**O commit ficou único, e isto é um desvio do planejado.** O plano eram três
commits — remoção, correção, documentação —, para que um `git revert` da
correção do download não arrastasse junto a remoção de código morto nem 300
linhas de markdown. Na prática o `git commit` sem `-m` abriu o editor, o buffer
saiu sem conteúdo (o git remove toda linha iniciada por `#` antes de validar, e
o que sobrou foi string vazia), e o lote acabou num commit só.

Consequência aceita: o `700de9a` é indivisível. Se algum dia for preciso
reverter só o `BUG-001`, será um revert manual do
`electron/services/http-scraper.service.ts`, não um `git revert` do commit.

O commit foi amendado depois para que a mensagem descrevesse o conteúdo real —
ela dizia `docs:` enquanto continha uma correção P0. Um commit que mente no
`git log` é o mesmo problema que o `RELEASE_GUIDE` desatualizado e o
`ARCHITECTURE.md` descrevendo um fallback desligado: documento que engana custa
mais que documento ausente.

Mensagem original planejada para esta tarefa, preservada porque descreve a
correção melhor que a mensagem consolidada:

```
fix: stop deleting valid downloads with an unknown content type

A file with no extension in its UI name, served as octet-stream with no
Content-Disposition, was assigned .pdf by a fallback. The next step then
checked magic bytes against that guess, found no %PDF, and unlinked the
file. Any .txt, .csv or .odt served that way was downloaded and
immediately destroyed.

The fix is not removing the fallback: most attachments in a university
portal really are PDFs served as octet-stream, so removing it would fix
the rare case and break the common one. Instead the extension is now
derived from the magic bytes, using the same table the verification
uses, so detection and verification read the same bytes and cannot
contradict each other. Unknown content gets no extension rather than a
lie.

Downloads now stream to .part and are renamed only after verification.
That is what lets the extension come from content, and it means an
interrupted download never leaves a file under the final name.

Fixed alongside, found while testing that last point: pipe() does not
forward source errors to the destination, so a connection dropped
mid-stream left the downloadFile promise pending forever and the UI
stuck on "downloading".

Red-green: tests/integration/download-real.test.ts was written first and
failed with "Deleted invalid file: LISTA 1.pdf".
```
