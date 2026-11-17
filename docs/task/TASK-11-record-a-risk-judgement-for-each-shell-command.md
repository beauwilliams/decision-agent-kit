---
Stable-Id: 01M7KN17SHRPXG8SVXT04C4VG8
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-10
Depends-on: TASK-10
---
# 11 — Record a risk judgement for each shell command

## Outcome

In shadow mode, each shell command gets a ledger entry saying whether the gate would have asked first.

## Acceptance checks

- A command writes one entry with the probability and the time taken. Evidence: a test.
- The command itself runs exactly as before. Evidence: a test.

## Plan

- [ ] Add the feature under `src/features`.
- [ ] Register it in the plugin with a mode setting.

## Evidence

None yet.
