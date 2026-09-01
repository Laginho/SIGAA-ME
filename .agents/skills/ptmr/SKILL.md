---
name: ptmr
description: The PTMR orchestration loop (PLAN, TEST, MAKE, READ). Use when running an orchestrated TDD cycle across Traycer agents, when acting as any PTMR role, or when validating a PTMR cycle as master dev.
---

# PTMR

A multi-agent TDD loop. A **master dev** writes implementation plans and validates results; a **PLAN** agent orchestrates three subagents — **TEST** (red), **MAKE** (green), **READ** (gate + refactor) — commits per phase, and hands back. The cycle repeats until the work is PR-ready. Every role's contract lives in [roles/](roles/); the repo-specific bindings (paths, conventions, issue tracker) live in that repo's `docs/agents/orchestration.md`.

PTMR is **opt-in**: the user invokes it explicitly per feature. It is never the default for small fixes.

## The cycle

1. **Master dev** writes a handoff (see [HANDOFF-TEMPLATE.md](HANDOFF-TEMPLATE.md)) covering **one issue** — or 2–3 only when the plan says they are inseparable — and pre-marks any **not-test-first** slices (markup, gesture timing). The handoff goes to `.scratch/<feature>/handoffs/NN-<direction>.md` (gitignored, never committed).
2. **The user relays**: they start a Traycer task for PLAN with the handoff's absolute path in the launch message. (v2: master dev runs as a Traycer agent and messages PLAN directly.)
3. **PLAN** reads the handoff, spawns TEST → MAKE → READ in order via `traycer_create_agent` / `traycer_send_message`, passing each its role doc by absolute path. PLAN never touches code. After each phase, PLAN commits that phase's work — three commits per cycle, never squashed.
4. **PLAN hands back**: a return handoff at the next `NN-` number, reporting what happened, per phase.
5. **Master dev validates** on the branch: full suite, diff vs plan, commit trail. Then either:
   - all good → repeat from 1 with the next issue, or create the PR when the feature is done (the **user** merges);
   - non-behavioural nits only → fix them in a `Role: MASTER` commit and proceed;
   - anything behavioural wrong → append the verdict to the ledger naming the culprit role and model, write a **correction handoff**, and route it back through PLAN. Never hand directly to TEST/MAKE/READ.

## Cast

Every handoff carries a `## Cast` block mapping roles to models, declared by the user per session:

```
## Cast
PLAN: gpt 5.6 terra (high)
TEST: <model>
MAKE: <model>
READ: <model>
```

The Cast block is the **sole model authority**. Cast names are the user's informal names; PLAN resolves each one by **searching** the full `traycer_list_harness_models` listing across every harness (opencode included) — case-insensitive, punctuation- and order-tolerant, with version fragments and a parenthesised effort ("(medium)") as qualifiers. A unique match is used and the informal-name → harness-id mapping is reported in the return handoff. Zero or multiple matches → PLAN stops and hands back **listing the closest candidates it found** — giving up without searching, or a bare "not found", is a contract violation. **Never substitute a model silently**: a silent substitution corrupts the ledger.

## Commits

- One commit per phase, authored by PLAN, in the Traycer-managed worktree on the `traycer/*` branch Traycer names (the plan names only the base branch).
- Every commit carries a trailer naming role and actual model: `Role: MAKE (mimo v2.5)`. Master dev nit commits use `Role: MASTER`.
- The PR title carries the issue slug; the PR description echoes the Cast.

## Loop bounds

Two attempts per subagent per cycle. After the second failure, PLAN commits whatever state is coherent (a red commit alone is fine), and hands back with the failure named. A stuck cycle is data — don't hide it behind retries.

## The ledger

`.scratch/<feature>/ledger.md`, **committed** (it sits outside the gitignored handoffs directory). One line per cycle:

```
| cycle | issue | verdict | culprit | reason |
| 03 | 05-card-list | correction | MAKE (mimo v2.5) | green commit special-cased the test fixture |
```

Verdict is `clean` (culprit `-`) or `correction`. This is the cross-session model scoreboard: append every cycle, even clean ones.

## Repo bindings

Each repo declares in `docs/agents/orchestration.md`: the feature/issue paths, the issue tracker conventions, base branch, and how to run the suite/typecheck/lint. Roles read it (Traycer folds the repo's `AGENTS.md` pointer into planning). Use the `setup-ptmr` skill to stamp bindings into a new repo.
