# DÉBITO-01 — Electron 30 fora de suporte
Status: open
Priority: —
Tracker status at migration: (sem linha de status — débito aceito conscientemente)

- **O quê:** o projeto roda Electron 30.5.1. O Electron mantém apenas as três
  majors mais recentes; vulnerabilidades de Chromium não recebem mais patch.
- **Por quê adiado:** atualizar muda a versão do Chromium embutido, e o scraper
  depende de comportamento de navegador (Playwright, cookies, sessão JSF). Risco
  real de quebrar o núcleo funcionante sem testes que provem o contrário.
- **Gatilho:** assim que a Fase 1 estiver completa e existir suíte executável em
  CI. Com testes rodando, a atualização passa a ser verificável em vez de
  apostada. **Obrigatório antes de distribuição pública ampla** — não é aceitável
  entregar Chromium sem patch a terceiros.
- **Mitigação:** superfície reduzida enquanto é uso pessoal e o app navega apenas
  para `si3.ufc.br`. Cai mais depois do `SEC-003`.
