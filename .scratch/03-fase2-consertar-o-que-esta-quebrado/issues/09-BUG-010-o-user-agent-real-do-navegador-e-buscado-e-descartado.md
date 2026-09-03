# BUG-010 — O User-Agent real do navegador é buscado e descartado
Status: resolved
Priority: P2
Tracker status at migration: `IN REVIEW` — código e testes prontos (sessão 2026-09-01); falta só a medição de taxa de falha em uso real, que é do Bruno

- Owner: Claude (sessão 2026-09-01)
- Dependencies: `BUG-001` (não mexer no caminho de download antes)
- Primary files: `electron/services/http-scraper.service.ts:118-123,198,254,351,685,870`,
  `electron/services/sigaa.service.ts:104-105`,
  `electron/services/playwright-login.service.ts:1131`

#### Problem

A arquitetura do projeto é "o Playwright mantém a sessão JSF, o HTTP pega os
cookies emprestados". O empréstimo dos cookies funciona. O do **User-Agent**
não.

Existe uma cadeia de quatro saltos construída exatamente para isso:

```
playwright-login.service.ts:1131   getUserAgent()        ← 1 chamador
        ↓
sigaa.service.ts:104-105           setUserAgent(ua)      ← 1 chamador
        ↓
http-scraper.service.ts:118        this.userAgent        ← 1 leitor
        ↓
                                   enterCourseHTTP       ← 0 chamadores
```

O único leitor de `this.userAgent` é o `enterCourseHTTP`, que é inalcançável
(ver `CLEAN-001`). Os **cinco requests que rodam de verdade** — linhas 198, 254,
351, 685 e 870 — hardcodam:

```
'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
```

Isso é um User-Agent **truncado**: falta o sufixo `Chrome/xxx Safari/537.36` que
qualquer navegador real envia. Ou seja, os requests HTTP se apresentam ao SIGAA
com uma identidade que não bate com a do navegador que criou aquela sessão.

#### Por que isto importa mais do que parece

Bruno relatou que **o download por HTTP falha com frequência e de forma
imprevisível** — foi o dado que decidiu o `BUG-004` (ligar o fallback Playwright
em vez de apagá-lo). Um portal JSF que valide consistência entre a sessão e o
cliente que a criou é um candidato plausível a essa causa, e é barato de testar.

Não é prova. É a hipótese mais barata disponível para uma falha que hoje não tem
explicação.

#### Ordem

Depois do `BUG-001`. Mesmo motivo do `BUG-004`: enquanto o app apagar arquivos
que baixaram com sucesso, a taxa de falha observada não é confiável para julgar
se o UA mudou alguma coisa.

#### Required behavior

- Os cinco requests usam `this.userAgent` em vez da string literal.
- Existe teste que afirma que o header `User-Agent` enviado é o que foi
  configurado por `setUserAgent`, e que falharia se alguém reintroduzisse a
  string literal (regra 5 do `CLAUDE.md`).

#### Acceptance criteria

- Nenhum User-Agent literal restante em `http-scraper.service.ts`.
- Teste do parágrafo acima existe e passa.
- Medida a taxa de falha de download antes e depois, registrada aqui. Se não
  mudar nada, isso também é resultado e deve ficar escrito — a hipótese fica
  descartada em vez de voltar daqui a seis meses.

#### Decisão relacionada (Bruno, 2026-08-09)

O `enterCourseHTTP` foi **mantido** por causa desta tarefa, mesmo sendo
inalcançável. Removê-lo levaria a cadeia do UA junto, e o `BUG-010` viraria
"reconstruir e ligar" em vez de "ligar". Custo aceito: 102 linhas de código
morto de pé até esta tarefa fechar.

#### Implementation notes (2026-09-01)

Os cinco requests reais (`http-scraper.service.ts` — entrar na disciplina,
dashboard, abrir seção de arquivos, notícias, download) trocaram a string
literal por `this.userAgent`. A cadeia `getUserAgent → setUserAgent →
this.userAgent` já existia e já era chamada no login; ela só não tinha leitor
vivo. Diff: 5 linhas.

Dois testes novos em `tests/integration/download-real.test.ts`:

1. **Comportamento** — `setUserAgent(ua)` e depois `downloadFile`; afirma que o
   header `User-Agent` enviado ao axios é o `ua` configurado.
2. **Tripwire de fonte** — nenhum `'User-Agent': '` literal restante no
   serviço. Cobre os quatro call sites que o teste de comportamento não
   exercita.

**Prova vermelho-verde:** os dois testes rodaram contra o código sem a correção
(2 failed, 6 passed — os testes do `BUG-001` continuam verdes, então a asserção
é específica) e com ela (8 passed).

**O que falta para `DONE`:** o terceiro critério — medir a taxa de falha de
download antes/depois em uso real. Isso é observação do Bruno no dia a dia; se
não mudar nada, registrar aqui e descartar a hipótese.

O `enterCourseHTTP` continua de pé e continua sendo o único leitor *morto* da
cadeia; agora que os requests vivos leem `this.userAgent`, remover o
`enterCourseHTTP` (102 linhas) voltou a ser seguro — candidato a limpeza num
`CLEAN-002` futuro.
