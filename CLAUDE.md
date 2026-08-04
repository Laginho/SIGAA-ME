# CLAUDE.md — regras deste projeto

App desktop Electron que faz scraping do SIGAA da UFC (`si3.ufc.br`) para dar ao
aluno leitura offline de disciplinas, arquivos e notícias.

**Leia antes de trabalhar aqui:** `docs/PLANO.md` (plano ativo e decisões
tomadas) e `docs/HARDENING_TRACKER.md` (status de cada tarefa). O
`CODE_REVIEW.md` é registro histórico com correções marcadas inline.

## Comandos

```bash
npm run dev          # desenvolvimento
npm run build        # build de produção
npm run quality      # typecheck + lint + testes, nessa ordem — é o gate
npm test             # só a suíte (vitest run, termina sozinho)
npm run typecheck    # só os tipos
npm run lint         # só o ESLint
```

**`npm install` roda no Windows, pelo autor.** O projeto depende de binários
nativos por plataforma (Electron, Playwright). Instalar de um ambiente Linux
para dentro desta pasta baixa binários errados e quebra o setup local.

O que um agente com esta pasta montada de um Linux consegue rodar, medido em
2026-08-04:

| Comando | Funciona? | Detalhe |
|---|---|---|
| `tsc --noEmit` | **Sim** | JS puro, ~20s. É o loop de feedback útil |
| `eslint .` | Inviável | ~40s **por arquivo** — ligado por I/O na montagem, não por CPU |
| `vitest run` | **Não** | `rolldown` exige binário nativo win32 |

Para lint e testes, copie o repositório (sem `node_modules`) para o ambiente do
agente e instale as dev-deps lá. Duas ressalvas: as versões podem divergir do
lock (o `tsc` de lá acusou erros de `axios` que não existem no repo real), e
3 testes falham fora do Windows pt-BR por dependerem de locale e de um caminho
`C:\` literal (tarefa `QA-002`). **A execução no Windows é a autoridade.**

## Arquitetura em uma frase

Playwright estabelece e mantém a sessão JSF do SIGAA; HTTP "pega emprestado" os
cookies para o que é possível (parsing e download, ~10x mais rápido) e cai de
volta no Playwright quando falha. Detalhes em `ARCHITECTURE.md` — leia antes de
mexer em scraping.

Persistência hoje: **JSON no `userData`** (main) + **`localStorage`** (renderer).
Não existe SQLite, apesar de `sqlite@5` estar no `package.json` sem uso e do
README dizer o contrário.

## Regras invioláveis

Cada uma existe por causa de um bug real deste repositório.

### 1. Nunca `innerHTML` com dado que veio do SIGAA

Nome de disciplina, nome de arquivo, título de notícia, corpo de notícia, foto de
perfil — tudo isso é **entrada não confiável**. Use `textContent`.

O corpo da notícia é a única exceção que pode precisar de HTML, e só depois de
sanitização com allowlist estrita (tarefa `SEC-001`, ainda não feita).

Não existe sanitizador no projeto hoje. Se precisar de um, essa é a tarefa
`SEC-001` — não improvise um inline.

### 2. Nunca `as any` para atravessar o IPC

Foi exatamente isso que escondeu o bug do `pauseSync()`:

```ts
// ERRADO — foi assim que um método inexistente passou meses sem ser notado
(window as any).api.pauseSync()
```

O cast desliga o verificador de tipos. Se `window.api` não tem o método que você
quer, o problema é o contrato do preload, não o TypeScript.

### 3. `try/catch` que só faz `console.error` é quase sempre um bug

Ou o erro importa — e precisa ser tratado ou propagado — ou não importa, e o
`try` não deveria existir. Engolir erro silenciosamente foi a segunda defesa que
falhou no caso do `pauseSync`.

### 4. Canal IPC novo precisa de tipo e validação

O preload hoje expõe `ipcRenderer` genérico (`send`/`on`/`invoke`), o que permite
ao renderer invocar qualquer canal. Isso é a tarefa `SEC-002` e está aberto.

**Não amplie essa superfície.** Todo canal novo: nomeado explicitamente, com
tipo, e com validação de payload no main. Nunca passe script JSF, ViewState,
cookie ou URL interna do SIGAA para o renderer.

### 5. Credencial nunca em código-fonte, e nunca com fallback

```ts
// ERRADO — aconteceu de verdade aqui, e foi para um repositório público
const password = process.env.SIGAA_PASS || '<senha real estava aqui>'
```

Credencial vem de `process.env` **sem valor padrão**. Se a variável não existir,
o programa falha — falhar é o comportamento correto. O `||` transforma um erro
de configuração numa credencial hardcoded permanente.

O `.gitignore` protege `.env`. Ele não protege senha escrita num arquivo `.ts`.

### 6. Retorno de IPC é união discriminada, não objeto com campos opcionais

```ts
// ERRADO — `if (!r.success) return` não estreita nada; `folderPath` continua
// `string | undefined` depois do early return, e o erro reaparece em todo
// consumidor
Promise<{ success: boolean; folderPath?: string }>

// CERTO — o early return estreita, e `folderPath` vira `string`
Promise<{ success: true; folderPath: string } | { success: false }>
```

Padrão a reconhecer: **erro de `null`/`undefined` repetido em vários call sites
quase sempre é uma união discriminada faltando na origem.** No `PIPE-002`,
corrigir a origem apagou 4 erros de uma vez sem tocar em nenhum consumidor.

E o contrato precisa casar com o que o main **devolve**, não com o que parece
razoável. O `vite-env.d.ts` foi escrito por leitura parcial do main e omitia
`account`, `photoUrl`, `skipped` e `results`. Ao declarar um retorno, abra o
handler **e** o serviço por trás dele.

### 7. Não crie abstração para um caso

Sem interface com uma implementação, sem factory para um produto, sem config para
valor que nunca muda. Este repositório já tem 6.282 linhas de TypeScript para um
app que lista arquivos — o problema não é falta de estrutura.

## Antes de commitar

1. `npx tsc --noEmit` passa.
2. `npx vitest run` passa.
3. Você não adicionou `any` em código de fronteira (`preload.ts`, handlers IPC).
4. Você não adicionou `innerHTML` com dado externo.
5. Se corrigiu um bug, existe um teste que falharia sem a correção.

`npm run quality` verde prova que **as coisas cobertas pela suíte** continuam
funcionando. Não prova que a sua mudança funciona, se nada exercita a sua
mudança. Antes de escrever "verificado", pergunte qual teste falharia se a
correção fosse revertida — se a resposta for "nenhum", o item 5 não foi
cumprido. Ver `QA-003` no tracker para o exemplo real disso neste repositório.

## Contexto histórico útil

Este projeto foi construído com foco em resultado, e o processo ficou para
depois. A dívida resultante está catalogada e sendo paga em ordem — não é
descuido, é plano.

Dois padrões de falha que já aconteceram aqui e vale reconhecer:

**Código que finge implementar algo.** O `pauseSync()` tinha chamada, `try/catch`
e cast — parecia proteção contra concorrência. Não fazia nada. Ao encontrar
código que parece cuidar de algo importante, confirme que o outro lado existe.

**Relatório de ferramenta tratado como fato.** O caso do `download.service.ts`
teve três conclusões erradas em sequência, e vale como aula:

1. Uma busca automática disse "código morto, não há `import ... from` dele".
   Errado — ele é carregado por `await import('./download.service')`.
2. A correção disse "está vivo, é o fallback do download". Também errado — os
   dois métodos que fazem esse import dinâmico
   (`playwrightLogin.downloadFile`/`downloadAllFiles`) **não têm chamador
   nenhum**. O download real vai por `httpScraper.downloadFile`, e o retry
   também é HTTP.
3. O `ARCHITECTURE.md` descreve um fallback Playwright para download. Ele existe
   como código e **não está ligado**.

Duas lições: busca por `import ... from` não encontra `await import()`, e provar
que um arquivo é importado **não** prova que ele é alcançável — é preciso subir a
cadeia de chamadores até um ponto de entrada real (handler IPC, `main.ts`, teste).
