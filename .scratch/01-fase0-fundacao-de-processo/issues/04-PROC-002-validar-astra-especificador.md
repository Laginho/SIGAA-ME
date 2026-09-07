# PROC-002 — Validar Astra high como especificador
Status: open
Priority: P2
Started: 2026-09-07

Fluxo em teste: **Astra high especifica**, Sonnet implementa, Opus revisa e
abre o PR. Objetivo: decidir se o Fable sai também da especificação, ficando
só no passe pré-release.

## O que o especificador entrega, e onde ele falha

O papel entrega três coisas: issue com critérios de aceite, testes **vermelhos**
contra código de produção, e um contrato que bate com o handler **e** o serviço
por trás dele (regra 6 do `CLAUDE.md`). As falhas típicas do papel:

1. Critério faltando: um comportamento que a implementação precisa ter e que
   nenhum teste cobra. O implementador não faz, o revisor talvez não veja.
2. Teste vazio: passa sem implementar nada, ou testa uma cópia da lógica em
   vez do código de produção (`parser.test.ts` fez isso e escondeu bug).
3. Contrato errado: tipo de retorno declarado por leitura parcial do main.
4. Escopo errado: teste que exige mudar arquivo fora do limite da tarefa.

Nenhuma dessas aparece no gate. A 2 e a 3 são mecânicas; a 1 e a 4 só saem
de uma leitura cega por outro modelo forte.

## Protocolo

Amostra: 3 tarefas, em ordem: `DEV-001` (superfície IPC), `OBS-001` (redação
de log, fronteira de dado), `PORTAL-001` (contrato do parser).

Por tarefa:

1. **Astra high**, sessão limpa, com `CLAUDE.md`, `docs/agents/orchestration.md`
   e a issue. Faz o grilling, escreve os critérios de aceite na issue, escreve
   os testes vermelhos, roda `npx vitest run` para provar que estão vermelhos
   pelo motivo certo, e **commita o spec** (`test: specify ...`). Não
   implementa nada.
2. **Fable high**, sessão limpa, **audita o spec cego**: recebe a issue como o
   Astra deixou e o diff do commit de spec, com o repo aberto. Não implementa.
   Responde em uma seção "Auditoria cega do spec (Fable)" no fim da issue,
   só com achados que têm cenário concreto:
   - critério que falta, com o bug que passaria sem ele;
   - teste que passa sem implementar (dizer qual e por quê), ou que testa cópia;
   - contrato declarado que não bate com handler + serviço (apontar a linha);
   - teste que obriga a tocar arquivo fora do limite da tarefa.
   Zero achados é resposta válida.
3. Fluxo normal a partir daqui: Sonnet implementa e commita, Opus revisa,
   commita a correção em cima e abre o PR. O Opus já procura "o que a issue
   não disse"; o que ele achar nessa categoria conta como achado de spec.
4. Bruno (ou uma sessão em low) classifica cada achado de spec, venha do Fable
   ou do Opus:
   - **A bloqueante.** Critério ou teste que faltou e deixaria passar bug de
     segurança, dado ou concorrência, com cenário. Teste vazio em fronteira
     de confiança também é A bloqueante. O Astra falhou.
   - **A-leve.** Critério faltando fora dessas classes, contrato errado que o
     `tsc` pegaria na implementação, teste vazio fora de fronteira. Sinal;
     dois A-leves na mesma tarefa viram bloqueante.
   - **B.** Débito visível só no repo inteiro. Passe pré-release pega.
   - **C.** Nome, estilo, redação da issue. Ignora.

Mecânico, feito pelo Fable no passo 2 além da leitura: `git stash` não
precisa; basta rodar `npx vitest run` no commit de spec e confirmar que cada
teste novo falha por **asserção**, não por import quebrado ou `tsc`. Teste
que falha por motivo errado é A-leve.

## Controle (adicionado 2026-09-07, após DEV-001)

A amostra DEV-001 reprovou por acúmulo, mas o protocolo não tinha baseline:
nenhum spec do Fable passou pela mesma auditoria. Em `OBS-001` os papéis
invertem: **Fable high especifica, Astra high audita cego**, com os mesmos
prompts e a mesma classificação. Isso separa "o Astra deixa buraco" de "todo
spec deixa buraco". `PORTAL-001` volta ao arranjo original.

A regra "dois A-leves viram bloqueante" foi copiada da PROC-001, onde A-leve
era bug em código. Aqui é buraco de spec que o revisor ainda pode pegar. Só
revisar a régua com o controle na mão.

## Critério

- **Astra aprovado:** zero A bloqueante nas três tarefas.
- A auditoria do spec é mais barata que o spec inteiro em Fable, então se o
  Astra passar, o custo do papel cai sem perder a diversidade de modelo:
  Astra especifica, Sonnet implementa, Opus revisa, Fable só no pré-release.
- Se reprovar: Fable volta à especificação. Se reprovar só em `OBS-001` ou
  `PORTAL-001`, o Astra fica para tarefas fora de fronteira de confiança.

## Prompts

**Astra (passo 1):**

```text
Você é o especificador desta tarefa, no loop descrito em CLAUDE.md e
docs/agents/orchestration.md. Leia a issue em <caminho>. Faça o grilling,
escreva os critérios de aceite na issue e os testes falhando contra código de
produção (nunca cópia da lógica). Antes de declarar qualquer contrato de IPC,
abra o handler no main e o serviço por trás dele. Rode npx vitest run e
confirme que cada teste novo falha por asserção. Commite como
"test: specify ... (<ID>)". Não implemente nada. Não edite docs/PLANO.md nem
outra issue.
```

**Fable (passo 2):**

```text
Sessão de auditoria cega de especificação. Leia a issue em <caminho> e o diff
`git show <commit do spec> -- tests electron src shared`. Não implemente.
Com o repo aberto, liste só achados com cenário concreto: critério faltando
(qual bug passaria), teste que passa sem implementar ou testa cópia, contrato
que não bate com handler + serviço (linha), teste que exige tocar arquivo fora
do limite. Rode npx vitest run e confirme que cada teste novo falha por
asserção. Escreva em uma seção "## Auditoria cega do spec (Fable)" no fim da
issue. Zero achados é resposta válida. Não abra ledger.md nem outra issue.
```

## Registro por tarefa

| Tarefa | Astra: testes / critérios | Achados de spec (Fable cego + Opus), classe | Veredito |
|---|---|---|---|
| DEV-001 | 2 casos em `dev-cache-mutation-boundary.test.ts` (boot dev + empacotado contra main real); editou `preload-dev-gate.test.ts` movendo a cobertura de `testApi` | 3 A-leves (Fable cego): A1 leg empacotada usa `--sigaa-dev` literal em vez do argv injetado pelo main; A2 spec não nomeia mecanismo e os dublês de IPC fecham as alternativas; A3 harness não distingue sinal antes/depois da janela (AC3 sem teste). Opus na revisão: 0 achado de spec (1 C, comentário em `vite-env.d.ts`); PR #8 merged | Reprova por acúmulo (2+ A-leves). Ressalva: A2 e A3 vêm da mesma omissão |
| OBS-001 (controle: Fable especifica, Astra audita) | | | |
| PORTAL-001 | | | |

## Fechamento

Se aprovado: registrar no `CLAUDE.md` (fluxo vigente, três tarefas, data) e
atualizar a memória do loop. Se reprovado: registrar o motivo aqui e manter o
Fable na especificação.
