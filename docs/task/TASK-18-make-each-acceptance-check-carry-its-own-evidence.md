---
Stable-Id: 01M7KRT29PG82AAF3GEVSBBW1G
Status: InProgress
Date: 2026-11-17
Author: beauwilliams
Kind: chore
---
# 18 — Make each acceptance check carry its own evidence

## Outcome

A task cannot be Done while one of its acceptance checks has no evidence: the record check computes the status from the checks and reports the difference.

TASK-1 was nearly marked Done with evidence for one of its three acceptance checks, and the record check would have passed.

## Acceptance checks

- A decision says where evidence that is not a file in the repository lives, so that an acceptance check can name it
- The task type declares its acceptance checks as items that each name evidence — evidence: code:.urzua/config.yaml
- A task set to Done with an item that has no evidence fails the record check — evidence: code:docs/evidence/TASK-18/done-with-unmet-item.txt
- The existing finished tasks pass, rewritten to cite their evidence — evidence: code:docs/task/TASK-1-see-the-stop-check-record-a-decision-in-a-live-session.md

## Plan

- [x] Read how the record tool computes a status from checklist items and what counts as evidence.
- [ ] Decide where evidence from live runs is kept (ADR-8 is proposed and waits for its decider).
- [x] Change the config and the task template.

## Evidence

Built on 2026-11-17 with urzua 0.4.7; not done until ADR-8 is accepted. The config loaded on the first try. TASK-1 and TASK-2 were rewritten to cite committed files, and the probes in `docs/evidence/TASK-18/` show the three findings. Tasks still open keep prose checks until they are worked on (ADR-8).
