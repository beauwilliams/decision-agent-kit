---
Stable-Id: 01M7KRFZ051055G64B1V981CTM
Status: InProgress
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-3
Depends-on: TASK-16
---
# 17 — Make the unfinished question tell stopping from asking

## Outcome

The "left work undone" finding separates a reply that gave up or stopped early from one that correctly waits for a decision only the person can make.

## Acceptance checks

- On the labelled replay, false alarms and misses for the finding are both lower than the 4 of 46 and 5 of 12 measured at 0.7 on 2026-11-17
- SPEC-1 states the reworded question — evidence: spec:docs/spec/SPEC-1-stop-check.md

## Plan

- [x] Read the turns the question got wrong.
- [x] Reword the question or split it in two.
- [x] Re-run the replay.
- [ ] Find why `states_unfinished` misses replies that leave work undone.

## Evidence

2026-11-17, branch `unfinished-question`. The report is `docs/evidence/TASK-17/replay-report.txt`.

- The finding is now two questions, each one judgment: does the reply say requested work was not done, and does it need something from the person. It is raised when the first is high and the second is low.
- False alarms fell: 2 of 68 at 0.7, against 9 of 64 for the single question on the same labels.
- Misses did not: 3 of 5, the same as the single question at 0.7. The first acceptance check is not met, so this task stays in progress.
- Scored alone against "work left undone", `states_unfinished` missed 5 of 12 at 0.7. The weakness is in detecting undone work, not in telling it from waiting.

Labels are from two models in agreement, with 5 true cases. That is too few to judge misses.
