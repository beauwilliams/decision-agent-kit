---
Stable-Id: 01M7KQZJ7N372QJ3F02WNWYAPR
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: chore
Milestone: MILE-15
Depends-on: TASK-13
---
# 14 — Confirm Jev and Sage answer the stop check in a live call

## Outcome

Each of the two providers added by ADR-7 has answered the stop check's questions from this repository, and ADR-7's table is corrected where the documentation was wrong.

## Acceptance checks

- A live session on each provider writes a stop check entry with probabilities. Evidence: the ledger entries.
- The request limit and the error body of each are confirmed by a request. Evidence: the responses, with the key removed.

## Plan

- [ ] Get a key for each provider.
- [ ] Run the TASK-1 turns on each.
- [ ] Revise ADR-7's table.

## Evidence

None yet.
