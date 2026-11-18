---
Stable-Id: 01M7KQZHD9AD43F84TY8ADJ939
Status: InProgress
Date: 2026-11-17
Author: beauwilliams
Epic: EPIC-1
Depends-on: MILE-1
---
# 15 — The stop check can ask any of three decision models

## Outcome

A setting chooses SubQ Snap, TypeSafe Jev or Levanto Sage, and the stop check works on each (ADR-7).

## Done means

- One client calls all three, with a provider held as data. Evidence: the diff and its tests.
- A live session on each provider writes a stop check entry that names the provider and model. Evidence: three ledger entries.
- The README says how to choose a provider and what each one keeps. Evidence: the README.
