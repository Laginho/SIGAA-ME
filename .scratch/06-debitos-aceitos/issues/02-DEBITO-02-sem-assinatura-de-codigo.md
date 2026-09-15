# DÉBITO-02 — Sem assinatura de código
Status: open
Stage: blocked
Priority: —
Tracker status at migration: (sem linha de status — débito aceito conscientemente)

- **O quê:** binários Windows não assinados; SmartScreen alerta.
- **Por quê adiado:** custo do certificado vs. projeto open source sem receita.
- **Gatilho:** se aparecerem usuários externos em número que justifique, checar
  programas de certificado gratuito/subsidiado para open source.
- **Mitigação:** checksums, build público auditável, README honesto. Ver
  `REL-001`.

## Critérios suspensos (saíram do `REL-001` em 2026-09-15)

Se o gatilho disparar e um certificado entrar, o ticket que reabrir isto herda
estes critérios, escritos originalmente no `REL-001`:

1. Instalador e executável portátil publicados têm assinatura Authenticode do
   publisher esperado (`Get-AuthenticodeSignature <artefato>` → `Valid`).
2. O CI falha em artefato não assinado ou assinado por publisher inesperado.
3. Setup, rotação e revogação do secret de assinatura documentados no
   `RELEASE_GUIDE.md`.
4. `electron-builder.json5` ganha a configuração de assinatura; hoje não há
   `sign`, `certificateFile` nem `signingHashAlgorithms`.

## Comments

- `Stage: blocked` porque o débito foi aceito conscientemente, não porque
  alguém parou no meio. O motivo e o gatilho de desbloqueio estão no corpo,
  em "Por quê adiado" e "Gatilho".
