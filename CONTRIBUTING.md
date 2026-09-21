# Contribuindo

## Antes de tudo: o histórico foi reescrito em 2026-09-21

Um par usuário/senha real do SIGAA ficou no histórico público (fallback `||` num
script de verificação, mais dumps de página com nome real e PDFs de disciplina).
A senha foi trocada e o histórico foi purgado com `git filter-repo`.

Clone anterior a essa data não serve mais — os hashes mudaram. **Clone de novo**,
não faça `git pull` num clone velho.

## Setup

Requer Windows para build e empacotamento (Electron + Playwright trazem binário
por plataforma). Desenvolvimento e testes rodam em Linux também.

```bash
npm ci
```

Se o `npm ci` avisar `install scripts blocked`, o npm 12 barrou algum pacote que
precisa de script de instalação. A aprovação fica em `allowScripts` no
`package.json`; para um pacote novo:

```bash
npm install-scripts approve <pacote>
```

Depois `npm rebuild <pacote>`.

## O gate

```bash
npm run quality
```

Typecheck, lint e testes, nessa ordem. Verde é obrigatório antes de abrir PR.
`npm test`, `npm run typecheck` e `npm run lint` rodam as etapas isoladas.

## Testes

A suíte padrão não toca a rede. Os tiers que fazem login real no portal
(`npm run test:live`, e 3 testes do `app.spec.ts`) exigem `.env` com credencial
sua e **não devem entrar em loop**: são logins automatizados numa conta real de
universidade, com risco de bloqueio. Rode manualmente, antes de release.

Teste novo vai contra o código de produção, não contra uma cópia da lógica. Um
teste unitário que reimplementava o parser já deixou um regex quebrado passar com
14 testes verdes em cima; por isso `tests/integration/parser-real.test.ts` chama
o serviço real sobre fixture.

`tests/e2e/` só aceita `*.spec.ts`. Um `*.test.ts` ali zera a coleta inteira do
Playwright sem erro óbvio.

## Regras que não se negociam

Cada uma existe por causa de um bug real deste repositório. A versão longa, com o
histórico de cada uma, está no [CLAUDE.md](CLAUDE.md).

1. **Nunca `innerHTML` com dado vindo do SIGAA.** Nome de disciplina, de arquivo,
   título e corpo de notícia, foto de perfil: tudo é entrada não confiável. Use
   `textContent`. A exceção é o corpo da notícia, e só via
   `src/security/html-sanitizer.ts`.
2. **Nunca `as any` para atravessar o IPC.** O cast desliga o verificador e já
   escondeu um método que não existia por meses. Se `window.api` não tem o
   método, conserte o contrato do preload.
3. **`try/catch` que só faz `console.error` é quase sempre bug.** Ou o erro
   importa e precisa ser tratado, ou o `try` não deveria existir.
4. **Canal IPC novo precisa de nome, tipo e validação de payload no main.** Não
   reintroduza `ipcRenderer` genérico. Nunca passe script JSF, ViewState, cookie
   ou URL interna do SIGAA para o renderer.
5. **Credencial vem de `process.env` sem valor padrão.** Sem variável, o programa
   falha — falhar é o certo.
6. **Retorno de IPC é união discriminada**, não objeto com campos opcionais.
   `{ success: true; path: string } | { success: false }`, para o early return
   estreitar de verdade.
7. **Não crie abstração para um caso.** Sem interface com uma implementação, sem
   factory para um produto, sem config para valor que nunca muda.

## Commits e PR

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…). Um commit por
mudança concluída, com o gate verde.

No PR, diga qual teste falharia se a sua correção fosse revertida. Se a resposta
for "nenhum", falta teste — gate verde prova que o que a suíte cobre continua
funcionando, não que a sua mudança funciona.

## Sobre `.scratch/` e `.claude/`

Boa parte do repositório é estado de fluxo de trabalho com agentes: `.scratch/` é
o issue tracker local em Markdown, `.claude/` são skills. Não é código do app e
não afeta o build. Contribuição normal não precisa tocar em nada disso.
