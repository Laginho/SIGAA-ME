# PTMR handoff template

File name: `.scratch/<feature>/handoffs/NN-<direction>.md`, numbered from `01`, where direction is `to-plan` (master → PLAN, initial or correction) or `to-master` (PLAN's return). Handoffs are gitignored — delivery is by absolute path in the launch message.

```markdown
# Handoff NN — <to-plan|to-master>

## Cast
PLAN: <model as the user declared it>
TEST: <model>
MAKE: <model>
READ: <model>

## Scope
Issue(s): .scratch/<feature>/issues/NN-<slug>.md   ← one issue; 2–3 only if inseparable, say why
Base branch: <branch>
Kind: <initial | correction — corrections name the prior cycle and what was wrong>

## Plan
<the master dev's implementation plan: seams, files, behaviours, ordering.
Detailed enough that TEST knows what to specify and MAKE knows what to build.>

## Not test-first
<slices exempt from the red phase (markup, gesture timing...), or "none".>

## Return report (to-master only)
<per phase: what TEST/MAKE/READ did, test counts, gate output, READ's findings,
anything incomplete — and if the cycle stopped early, which role failed and how.>
```
