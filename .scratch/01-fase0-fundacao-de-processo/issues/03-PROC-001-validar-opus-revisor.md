# PROC-001 — Validar Opus como revisor (e Sonnet como implementador)
Status: open
Priority: P2
Started: 2026-09-06

Fluxo em teste: Fable especifica, Sonnet implementa, Opus revisa e abre o PR.
Objetivo: decidir se o Fable sai da revisão de vez, ficando só na
especificação e num passe pré-release no repo inteiro.

## Por que não basta auditar a revisão do Opus

Uma auditoria em effort baixo mede se o Opus **disse a verdade** (gate
reproduz, achados têm teste que falha sem a correção, não-achados têm
argumento que fecha). Ela não mede se ele **achou tudo**: quem lê uma revisão
pronta procura o que já foi apontado. Completude só se mede com revisão cega.

## Protocolo

Amostra: **3 tarefas de fronteira de confiança ou concorrência** revisadas
pelo Opus. `DATA-002` é a primeira.

Por tarefa:

1. Opus revisa e fecha a issue normalmente (seção "Revisão" na issue, PR).
2. Fable em **high**, sessão limpa, revisa **cego**: recebe só o diff
   (`git diff <commit do spec>..<commit da implementação> -- electron src shared tests`)
   e a issue **sem a seção "Revisão"**. Não abre o PR nem o `ledger.md`.
   Escreve os achados numa seção "Revisão cega (Fable)" no final da issue,
   com cenário concreto em cada um, antes de ler qualquer coisa do Opus.
3. Bruno (ou uma sessão em low) compara e classifica cada achado que o Fable
   teve **a mais** que o Opus:
   - **A. Bug com cenário concreto na mudança.** Se toca segurança, dado ou
     concorrência, é **A bloqueante**: o Opus falhou. Fora disso é **A-leve**:
     conta como sinal, não derruba, mas dois A-leves no mesmo trecho que o
     Opus declarou correto viram bloqueante.
   - **B. Débito visível só olhando o repo inteiro** (padrão repetido, drift
     de contrato, abstração fantasma). Um passe pré-release pega.
   - **C. Estilo, nome, comentário.** Ignora.

## Critério

- **Opus aprovado:** zero achados A bloqueantes nas três tarefas. Uma ocorrência
  derruba; três amostras não perdoam.
- **Sonnet aprovado (por osmose):** os achados do Opus sobre o trabalho dele
  são poucos e nenhum é de fronteira de confiança sem teste no contrato. Se
  o Opus acha bug de segurança/dado a cada tarefa, o Sonnet não serve para
  essa classe de tarefa mesmo com revisor bom.
- **O passe pré-release não substitui a caixa A.** Uma revisão de PR tem o
  diff e o porquê; um passe no repo inteiro vê só o estado final. O
  `resetLog()` sem `await` do DATA-002 só era suspeito porque a linha acabou
  de nascer para apagar dado de outra conta.

## Registro por tarefa

| Tarefa | Opus: achados | Fable cego: a mais (A/B/C) | Veredito |
|---|---|---|---|
| DATA-002 | 2 (resetLog sem await; LoggerService.clear engolia erro) | 1 A-leve: `resetAppLog` com `rmSync` falhando deixa `logStream` encerrado, main sem log em arquivo até reiniciar. Opus olhou o trecho e o declarou correto. Não é segurança/dado/concorrência. Comparação assimétrica: `fe0594d` já traz as correções do Opus | Opus passa (0 A bloqueante) |
| — | | | |
| — | | | |

## Fechamento

Se aprovado: registrar no `CLAUDE.md` com as três tarefas e a data; o Fable
passa a aparecer só na especificação e no passe pré-release. Se reprovado:
voltar o Fable à revisão de tarefas de fronteira, Opus fica nas demais.
