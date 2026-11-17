---
Stable-Id: 01M7KRFY5F8X72ZR7ZENGDSRTA
Status: Done
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

- A turn whose only change is made by a shell command that writes a file is not `nothing_to_check` — evidence: test:tests/stop-check.test.ts
- A read-only shell command is still not counted as an edit — evidence: test:tests/stop-check.test.ts
- The replay report shows how many turns moved out of `nothing_to_check` — evidence: code:docs/evidence/TASK-15/replay-report.txt

## Plan

- [x] Decide how to tell a writing command from a reading one, and what to do when it is unclear.
- [x] Change the evidence collector.
- [x] Re-run the replay.

## Evidence

Done on 2026-11-17 on branch `count-shell-edits`.

- A command counts as a write when it runs a program that changes files (`sed -i`, `tee`, `mv`, `cp`, `rm`, `git apply` and similar) or redirects output to a file. When it is unclear, it counts as a write: the cost is one extra question (ADR-4).
- One command that writes and then checks, such as `sed -i ... && make test`, counts as the edit followed by the check.
- Replay: `nothing_to_check` fell from 141 of 154 turns to 110 of 160, `unverified` rose from 10 to 39 and `verified` from 3 to 11. The "claims it works" question is now scored on 39 turns, of which 9 are labelled.

Not covered: a write made by a script the command runs (`python gen.py`) is not seen unless its output is redirected.
