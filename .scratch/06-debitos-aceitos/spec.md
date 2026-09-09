### Débitos técnicos aceitos conscientemente

Registrados no formato da seção 6: o quê, por quê, e o que faz voltar.

#### DÉBITO-01 — Electron 30 fora de suporte

- **O quê:** o projeto roda Electron 30.5.1. O Electron mantém apenas as três
  majors mais recentes; vulnerabilidades de Chromium não recebem mais patch
  nesta linha.
- **Por quê adiado:** atualizar Electron muda a versão do Chromium embutido, e o
  scraper depende de comportamento de navegador (Playwright, cookies, sessão
  JSF). Risco real de quebrar o núcleo funcionante sem testes que provem o
  contrário.
- **Gatilho de reavaliação:** assim que a Fase 1 estiver completa e existir
  suíte executável em CI. Com testes rodando, a atualização passa a ser
  verificável em vez de apostada. **Obrigatório antes de qualquer distribuição
  pública ampla** — não é aceitável entregar Chromium sem patch a terceiros.
- **Mitigação nesse meio-tempo:** o app tem superfície de ataque reduzida
  enquanto é uso pessoal e navega apenas para `si3.ufc.br`. Depois do `SEC-003`
  (política de navegação), a superfície cai mais.

#### DÉBITO-02 — Sem assinatura de código

- **O quê:** binários Windows não assinados; SmartScreen alerta na instalação.
- **Por quê adiado:** certificado custa centenas de dólares/ano e o projeto é
  open source sem receita.
- **Gatilho de reavaliação:** se aparecerem usuários externos em número que
  justifique, checar programas de certificado gratuito/subsidiado para open
  source.
- **Mitigação:** checksums SHA-256, build público e auditável via Actions, e
  README honesto em vez de instruir o usuário a ignorar o aviso. Ver 5.2.

#### DÉBITO-03 — Sem proteção contra concorrência no Playwright

- **O quê:** sync em background e ação do usuário podem navegar a mesma página
  Playwright simultaneamente. O `pauseSync` que deveria evitar isso nunca
  existiu de fato e será removido na tarefa 2.4.
- **Por quê adiado:** a solução correta é o `CONC-001` (coordenador de operações
  com `AbortSignal`), que é trabalho de Fase 3.
- **Gatilho de reavaliação:** obrigatório na Fase 3. Sobe de prioridade
  imediatamente se aparecer qualquer bug de sincronização corrompendo dados.
- **Mitigação:** nenhuma. O risco existe hoje e é conhecido.

#### DÉBITO-04 — Fixtures de portal sintéticas

- **O quê:** as oito fixtures de `tests/fixtures/sigaa/ufc-sigaa-2026.09-v1/`
  (`PORTAL-002`) são escritas à mão, não capturadas do `si3.ufc.br` — a fixture
  concorda com o parser por construção.
- **Por quê adiado:** captura real pede sessão logada na conta do autor, no
  Windows, com alguém olhando, mais sanitização manual de cada arquivo.
- **Gatilho de reavaliação:** `PORTAL-004` (canary contra o portal real) é a
  mitigação planejada; sobe de prioridade se o canary pegar um drift que as
  fixtures deixaram passar, ou antes de distribuição pública ampla.
- **Mitigação:** uma captura real limpa já existe
  (`course-page-real-with-tasks.html`, usada por `parser-real.test.ts`), e a
  auditoria do `PORTAL-002` fixou o método — a mutação que prova uma fixture é
  em `selectors.ts`/classifier, não na fixture.

---
