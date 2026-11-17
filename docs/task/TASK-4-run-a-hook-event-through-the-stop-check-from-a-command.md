---
Stable-Id: 01M7KN14CK6DHF8BJEQAMQMQ5F
Status: InProgress
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-5
Depends-on: TASK-3
---
# 4 — Run a hook event through the stop check from a command

## Outcome

A command reads a hook event on standard input, runs the stop check and writes a ledger entry.

## Acceptance checks

- Given a recorded end-of-turn event, the command writes one stop check entry. Evidence: a test.
- With no API key it exits cleanly and says why. Evidence: a test.
- The key appears in no output or ledger entry. Evidence: a test.

## Plan

- [x] Decide how the command is run with no build step (ADR-10).
- [ ] Map the event to the transcript model.
- [ ] Supply fetch, sleep and file access from Node.

## Evidence

None yet.
