# DÉBITO-04 — Fixtures de portal sintéticas
Status: open
Stage: blocked
Priority: —
Tracker status at migration: (sem linha de status — débito aceito conscientemente)

- **O quê:** as oito fixtures novas de `tests/fixtures/sigaa/ufc-sigaa-2026.09-v1/`
  (`PORTAL-002`) são escritas à mão, não capturadas do `si3.ufc.br`. A fixture
  concorda com o parser por construção, como `tests/fixtures/README.md` já
  registra: um layout do SIGAA que ninguém previu não aparece nelas.
- **Por quê adiado:** captura real pede sessão logada na conta do autor no
  portal da universidade, no Windows, com alguém olhando, mais sanitização
  manual arquivo por arquivo. Agente não faz. O valor extra é baixo comparado
  com o canary, que é o que de fato olha o portal real.
- **Gatilho:** `PORTAL-004` (canary agendado contra o `si3.ufc.br`) é a
  mitigação planejada. Sobe de prioridade se o canary pegar um drift que as
  fixtures deixaram passar, ou antes de distribuição pública ampla.
- **Mitigação:** existe uma captura real limpa no repo
  (`course-page-real-with-tasks.html`), exercitada por
  `tests/integration/parser-real.test.ts`. A auditoria do `PORTAL-002`
  (2026-09-08) fechou os dois ramos de classificador que nenhuma fixture
  ancorava e fixou o método: a mutação que prova uma fixture é em
  `selectors.ts`/classifier, não na própria fixture.
