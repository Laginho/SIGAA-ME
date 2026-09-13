| Data | ID | Commit |
|---|---|---|
| 2026-09-07 | DL-002 | 70fcb4b, 78f69f1 |
| 2026-09-07 | DEV-001 | 52aa87a |
| 2026-09-07 | DEV-002 | f28a00f |
| 2026-09-07 | PORTAL-001 | 1578d00, 0b7566d |
| 2026-09-08 | PORTAL-002 | eaf5da5; revisão independente registrada na Resolution da issue |
| 2026-09-08 | PORTAL-003 | 63e6ebc, a18346f, 9b4dbf8; reaberta duas vezes, ressalvas de AC3/AC4 registradas na Resolution |
| 2026-09-09 | OBS-001 | d60d3a1, e08dd3d; cinco achados corrigidos na revisão, neste commit |
| 2026-09-09 | OBS-004 | 2359776, 44fae3a, e404135, adb193c; reaberta uma vez pelo `clear()` do OBS-001, fechada na segunda passada |
| 2026-09-09 | OBS-005 | 019b798, eaa5ef0, 1f05cfa, aa40ddc; dois achados corrigidos na revisão (chave de meta fora da lista redigida, teste sem asserção), critério 1 aceito com ressalva |
| 2026-09-10 | QA-007 | b8d1f61; auditoria somente-leitura, aprovada na revisão com um nono achado encaminhado ao A11Y-003 |
| 2026-09-11 | A11Y-001 | fda43a2, 1730807, 9a83c26, 9c7d4c7, 442f1de, 11e0918, 173a634, 98af5a4, 793f0ca, 375dcf6; quatro voltas de retrabalho, 8 critérios, fechada sem mudança de código na revisão |
| 2026-09-11 | DEP-003 | b29fc46; revisão sem mudança de código, critério 1 fechado como "sem achado de axios" |
| 2026-09-11 | A11Y-003 | e6f95d0, bbee8fd, 613c3b5; reaberta uma vez por critério sem teste, fechada sem mudança de código na revisão |
| 2026-09-11 | CLEAN-004 | 3d1f22f, 622ac43; revisão sem mudança de código, três critérios OK |
| 2026-09-11 | DL-003 | e93f4fe, ca946ac, 7079768; três linhas mortas apagadas na revisão, critério 2 aceito com ressalva (descarte do `.part` sem teste, encaminhado ao DL-004), CLEAN-005 e QA-008 abertos |
| 2026-09-11 | DL-005 | e42d4f2, 1ca9b12, 3be2250; reaberta uma vez por critério 2 sem teste, fechada sem mudança de código na revisão |
| 2026-09-11 | DATA-003 | a4f7405, 1d6ef0f, 485e38d, 3a72628, 8c615c1, 34c6941, 1c921e1; reaberta uma vez pelos critérios 5-7, fechada sem mudança de código na segunda revisão |
| 2026-09-11 | QA-008 | 31bd5b2, 44e6136; revisão sem mudança de código, critério 4 aceito com ressalva (o verde veio de trocar `flushAll` por microtask, não do cenário do critério), BUG-013 aberto |
| 2026-09-12 | OBS-002 | 35a4e75, 8a468be; reaberta uma vez pelo `name` em `meta` do Contrato, requisito cortado pelo humano em vez de implementado, fechada na segunda revisão com o campo morto removido neste commit |
| 2026-09-12 | OBS-003 | 557d071, 6bc7e92, 24e0048, 9854273, 4e69bb3, a80d289, 543513d, 5922ddb; reaberta duas vezes pelo critério 8 (efeito colateral de `removeLegacyLogs` no import apagando arquivos no temp real do sistema), fechada sem mudança de código na terceira revisão; desvio aceito no critério 6 (um `shouldCaptureRawArtifact` inline em `playwright-login.service.ts:333`) |
| 2026-09-12 | PORTAL-004 | 6e1929b, b15ae5a, 63fb383; canário na nuvem cortado por decisão (sem conta de teste dedicada), fechado como `npm run test:live` manual; revisão Approve sem mudança de código, duas correções de doc fora dos Primary files (`CLAUDE.md`, nota em `QA-001`) |
| 2026-09-12 | PORTAL-005 | 41d93be, dd6f963, 19d07c6, 160aa91, 93348fc, 76c823c, 964a1f8, 09e4f61, 54dae06; reaberta uma vez (o retry pós-re-login não armava o kill-switch), fechada sem mudança de código na segunda revisão |
| 2026-09-12 | A11Y-002 | 2985e25, 7f5f1b9, 2011388, 17663af, e31fa3b, 79b4d11, PR #17; reaberta uma vez pelo critério 3 (o modal aberto por `showModal()` tirava o course-detail da árvore do axe e mascarava `.news-notification`), fechada sem mudança de código na segunda revisão com o vermelho reproduzido |
| 2026-09-13 | DEP-004 | 351e01f, b3812b1, PR #18; attempt 1 parou por premissa errada no ticket (dizia que não havia script `--ui`), corrigida na etapa 1 antes da segunda tentativa; revisão Approve sem mudança de código, os 4 critérios verificados no Windows |
| 2026-09-13 | BUG-012 | ab64846, dfdf4d8, 5d9d609, PR #21; reaberta uma vez porque o único teste mockava `deps.simulateNewFile` e nunca chegava ao `main.ts`; fechada sem mudança de código na segunda revisão, com cada `catch` derrubado em separado; lacuna aceita no critério 1 (a chamada de `log.error` não tem asserção) |
| 2026-09-13 | BUG-013 | 2436e68, 781d036, PR #22; revisão Approve sem mudança de código, os 3 critérios verificados com o vermelho reproduzido |
