# Fixtures de HTML do portal

HTML de página de turma, salvo em arquivo, para os testes de parser rodarem sem
rede e sem credencial.

## Por que isto existe

`tests/unit/parser.test.ts` testa uma **cópia** do parser: o próprio arquivo
declara que suas funções "mirror the parsing logic in the service". Uma cópia
não regride junto com o original, então aqueles testes podem ficar verdes
enquanto o `HttpScraperService` real quebra.

`tests/integration/parser-real.test.ts` chama o parser **de verdade**, passando
estes arquivos pelo parâmetro `preFetchedHtml` de `getCourseFiles()`, que
curto-circuita a rede. É o mesmo caminho de código que roda em produção.

## Procedência: estas fixtures ainda são sintéticas

Os três arquivos atuais foram extraídos dos literais que estavam embutidos em
`parser.test.ts`. São HTML **escrito à mão** imitando o SIGAA — pequenos e
plausíveis, não gravados do portal. Eles provam que o parser real funciona
contra a estrutura que **achamos** que o SIGAA tem.

Isso deixa um buraco: se o SIGAA nunca teve exatamente essa estrutura, ou mudou,
a fixture concorda com o parser por construção e ninguém percebe.

## Fechando o buraco: gravar do portal real

Ainda não existe gravador automatizado, de propósito. Um script de login não
verificado, apontado para o SIGAA com credencial real, erra selector e vira
sequência de tentativas de login malsucedidas — risco de bloqueio de conta por
um ganho que não justifica. Escrever esse gravador pede uma sessão onde ele possa
ser rodado e conferido passo a passo, no Windows, com alguém olhando.

Por enquanto, o caminho manual: com o app aberto e logado, salve o HTML da página
de turma (DevTools → Elements → copiar o `<html>`, ou o `debug_playwright.html`
que o `HttpScraperService` já grava no `userData`), e substitua o arquivo aqui.

Depois de gravar, rode `npm test`. Se `parser-real.test.ts` falhar, a diferença
entre o que o parser espera e o que o portal manda **é** o resultado — é
exatamente o sinal que o `PORTAL_COMPATIBILITY.md` acompanha.

## O que não guardar aqui

O HTML gravado vem de uma sessão autenticada. Antes de commitar, confira que não
sobrou nome, matrícula, CPF ou `JSESSIONID`. O gravador tenta limpar os padrões
óbvios, mas ele não sabe o que o seu portal mostra — a revisão é sua.

## `course-page-real-with-tasks.html` — a primeira fixture gravada do portal

Salva pelo Bruno em 2026-09-01 (navegador, Ctrl+S, "somente HTML") da página
"Principal" da turma SINAIS E SISTEMAS, ISO-8859-1 convertida para UTF-8. Tem 7
arquivos (`idInserirMaterialArquivo`, com `key`) e 2 tarefas
(`idEnviarMaterialTarefa`, sem `key`), ambos com o mesmo
`jsfcljs(...,id,...)`. É o que prova o `BUG-011`: o parser listava tarefa como
arquivo, o download HTTP recebia a página "Responder tarefa" e o fallback
Playwright abria um Chrome à toa.

Limpeza feita antes de commitar: o nome do usuário virou `DISCENTE FIXTURE` e os
caminhos de imagem do "salvar como" viraram `./img/`. O `ViewState` da página é
`j_id10`, um índice do MyFaces, não um token de sessão. Não há matrícula, CPF nem
`JSESSIONID` no HTML.
