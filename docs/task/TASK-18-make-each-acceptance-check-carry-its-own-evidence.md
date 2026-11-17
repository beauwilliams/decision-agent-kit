---
Stable-Id: 01M7KRT29PG82AAF3GEVSBBW1G
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: chore
---
# 18 — Make each acceptance check carry its own evidence

## Outcome

A task cannot be Done while one of its acceptance checks has no evidence: the record check computes the status from the checks and reports the difference.

TASK-1 was nearly marked Done with evidence for one of its three acceptance checks, and the record check would have passed.

## Acceptance checks

- A decision says where evidence that is not a file in the repository lives (output of a live session, a ledger file, a capture), so that an acceptance check can name it. Evidence: an ADR.
- The task type declares its acceptance checks as items that each name evidence. Evidence: the record config.
- A task set to Done with an item that has no evidence fails the record check. Evidence: the finding on a scratch record.
- The existing tasks pass, rewritten where needed. Evidence: a clean record check.

## Plan

- [ ] Read how the record tool computes a status from checklist items and what counts as evidence.
- [ ] Decide where evidence from live runs is kept.
- [ ] Change the config and the task template.

## Evidence

None yet.
