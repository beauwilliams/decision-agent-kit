---
Stable-Id: 01M7KRFY5F8X72ZR7ZENGDSRTA
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: bug
Severity: medium
Milestone: MILE-2
---
# 15 — A file changed by a shell command is not counted as an edit

## Outcome

A turn that changes files through the shell is judged as a turn that changed files.

In the replay of 2026-11-17, 141 of 154 turns were `nothing_to_check`. Many of those turns changed files with shell commands, which the evidence collector does not see, so the "claims it works" question was asked on only 10 turns.

## Acceptance checks

- A turn whose only change is made by a shell command that writes a file is not `nothing_to_check`. Evidence: a test.
- A read-only shell command is still not counted as an edit. Evidence: a test.
- The replay report shows how many turns moved out of `nothing_to_check`. Evidence: the report.

## Plan

- [ ] Decide how to tell a writing command from a reading one, and what to do when it is unclear.
- [ ] Change the evidence collector.
- [ ] Re-run the replay.

## Evidence

None yet.
