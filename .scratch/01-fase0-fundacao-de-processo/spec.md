### FASE 0 — Fundação de processo

*Objetivo: criar os artefatos que fazem o projeto se defender sozinho.*

#### 0.1 — Corrigir os documentos de auditoria

- Atualizar `CODE_REVIEW.md`: marcar o item do teste como resolvido, corrigir a
  contagem de `innerHTML`, remover `notification-store.ts` da lista de afetados.
- Adicionar os 5 achados novos (2.3) ao `HARDENING_TRACKER.md` como tarefas.
- Registrar a mudança de ordem no `Task change log` do tracker.

**Pronto quando:** os dois documentos refletem o estado real de 2026-08-02.

#### 0.2 — Escrever o `CLAUDE.md`

Arquivo na raiz que todo agente lê automaticamente. Deve conter: comandos do
projeto, arquitetura em uma frase, regras invioláveis (nunca `innerHTML` com
dado do SIGAA; nunca `as any` para atravessar IPC; todo canal novo precisa de
tipo e validação), e o que fazer antes de commitar.

**Por que primeiro:** este é o artefato que teria evitado boa parte da bagunça.
Ele codifica seu julgamento num lugar que os agentes herdam.

**Pronto quando:** existe e um agente novo consegue trabalhar no repo sem
repetir os erros conhecidos.

---
