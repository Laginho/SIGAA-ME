### FASE 4 — Prontidão para distribuição

*Só faz sentido depois da Fase 3.*

- `DEP-001` — atualizar dependências (ver débito registrado abaixo)
- `OBS-001` — logger novo com redação e rotação; `main.ts` sem monkeypatch;
  infraestrutura do main migra (expand)
- `OBS-004` — pipeline de scraping migra para o logger; `scraper.log` some;
  teste de fronteira nos serviços reais (depois de `OBS-001`)
- `OBS-005` — `playwright-login` migra; contract: assinatura `meta?` e
  `no-console` em `electron/**` (depois de `OBS-004`)
- `OBS-003` — dumps de HTML via `DiagnosticsService`, clear-all apaga
  `diagnostics/`, limpeza de legado a cada boot (depois de `OBS-005`)
- `OBS-002` — `[op:<id>]` via `AsyncLocalStorage` (depois de `OBS-004`;
  cortável)
- `A11Y-001` — acessibilidade (`lang="pt-BR"`, semântica, foco)
- `PORTAL-001..005` — adaptador de compatibilidade e canário
- `REL-001` — assinatura de código (**custa dinheiro** — certificado de code
  signing para Windows)

**Marco:** produto público de verdade.
