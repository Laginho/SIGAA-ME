# QA-002 — A suíte não é portável: locale e caminho absoluto do Windows
Status: resolved
Priority: P1
Tracker status at migration: `DONE` — corrigido na sessão 2026-08-05

- Owner: Claude
- Dependencies: `PIPE-002`
- Primary files: `src/utils/ui-helpers.ts`,
  `tests/unit/ui-helpers.test.ts`,
  `tests/integration/persistence-auth-recovery.test.ts`

#### Problem

Descoberto ao rodar a suíte fora do Windows pt-BR (sessão 2026-08-04): 3 testes
falham por dependerem do ambiente, não do código.

**a) Locale (2 testes).** `ui-helpers.ts:21,25` usa
`toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })`. O `[]` quer
dizer "use o locale do sistema". Em pt-BR sai `10:30`; em en-US sai
`10:30 AM`. Os testes afirmam `/\d{2}:\d{2}$/`, que só vale em locale de 24h.

Runner do GitHub Actions é en-US **inclusive no `windows-latest`**. Ou seja: o
`PIPE-003` nasceria vermelho, e por um motivo que não tem nada a ver com o PR
sendo testado. Gate que nasce vermelho é gate que se aprende a ignorar.

Não é só teste: é bug de UI pequeno e real. Um aluno com Windows em inglês vê
hoje `hoje às 10:30 AM` — metade em português, metade em formato americano.

**b) Caminho absoluto do Windows (1 teste).**
`persistence-auth-recovery.test.ts:63` grava em
`'C:\\tmp\\sigaa-me-persistence-tests\\credentials.json'`, literal. Fora do
Windows o arquivo nunca é encontrado, `loadCredentials()` devolve `null` pelo
caminho de "arquivo ausente" em vez do de "payload corrompido", e o
`expect(errorSpy).toHaveBeenCalled()` falha. O teste **passa por acidente** no
Windows: ele não está exercitando o que diz exercitar.

#### Acceptance criteria

- `toLocaleTimeString` recebe locale explícito (`'pt-BR'`); a saída do app é a
  mesma em qualquer máquina.
- O teste de persistência monta o caminho com `path.join` + `os.tmpdir()`.
- A suíte passa com `LANG=en-US` e em sistema de arquivos POSIX.

#### Rationale

Teste que depende do ambiente da máquina do autor não é gate, é coincidência.
Consertar isto é pré-requisito do `PIPE-003` — sem isso o CI reprova PRs bons.

#### Implementation notes (2026-08-05)

**a) Locale.** `ui-helpers.ts` agora tem uma função `formatClock` única, com
locale explícito: `toLocaleTimeString('pt-BR', { hour: '2-digit',
minute: '2-digit', hour12: false })`. O comentário no arquivo registra o motivo.
Note que a correção **não** foi no teste: era bug de UI real (um Windows em
inglês mostrava `hoje às 12:30 PM` no meio de uma frase em português), e o teste
só o tornou visível.

**b) Caminho absoluto.** `persistence-auth-recovery.test.ts` não escreve mais em
disco: o `fs` é mockado por um `storage.files` em memória e os dois testes leem
de lá. Não sobrou nenhum literal `C:\` na suíte — o caminho deixou de existir em
vez de ficar portável, que é a correção mais forte das duas.

**O que isto prova:** o gate rodou verde num Linux (ver `CLAUDE.md`, tabela do
container), o que é exatamente a condição que faltava. **O que não prova:** a
execução no Windows para este lote ainda não aconteceu — e ela continua sendo a
autoridade. Rodar antes de commitar.
