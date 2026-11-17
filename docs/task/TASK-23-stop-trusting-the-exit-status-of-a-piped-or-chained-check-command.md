---
Stable-Id: 01M7MJH21833KMHBXHY19Y0MFR
Status: Done
Kind: bug
Severity: high
Milestone: MILE-3
Depends-on: TASK-19
Date: 2026-11-17
Author: beauwilliams
---
# 23 — Stop trusting the exit status of a piped or chained check command

## Outcome

The stop check no longer reports `verified` for a check that failed behind a pipe or a following command.

In Claude Code the rule reads a command's exit status. In 94 recorded check commands, 23 of the 24 that failed exited cleanly, because their output went through `tail`, `grep` or `head`, or another command ran after them (`docs/evidence/TASK-19/check-outcome-report.txt`). Each of those is a `verified` verdict that is wrong, and a turn that claims success on it is not flagged.

## Acceptance checks

- A check command whose exit status cannot be trusted (a pipe, `;`, `||`, `&`, or a new line) is treated as having no reported outcome, so `check_failed` decides it — evidence: test:tests/stop-check.test.ts
- Replay says how many `verified` verdicts change, and how many of the changes the labels support — evidence: code:docs/evidence/TASK-23/turn-impact.txt
- The README and the spec say that command output is then sent for Claude Code sessions too — evidence: code:README.md, code:docs/spec/SPEC-1-stop-check.md

## Plan

- [x] Decide with the maintainer whether sending check output from Claude Code sessions is acceptable. Asked in chat on 2026-11-17 with what would be sent; the answer was "Yeah, let's do that."
- [x] Detect the command shapes whose exit status is not the check's.

## Evidence

Done on 2026-11-17 on branch `task-23-untrusted-exit`.

- `hidesExitStatus` marks a check command with a pipe, `;`, `||`, a lone `&` or a new line. Its outcome is then unknown and `check_failed` decides it. `&&` alone keeps the exit status.
- In 183 recorded turns, all 20 whose verdict rested on a check now go to the question; none ran its check plainly. On the 19 labelled, the exit status was wrong once and the question was wrong once, on different turns (`docs/evidence/TASK-23/turn-impact.txt`).
- A live Claude Code session ran a failing test as `node --test 2>&1 | tail -12`, which exits cleanly. The entry in `docs/evidence/TASK-23/live-entry.jsonl` records `failing_check` from the model at 1.00; before this change it would have read `verified`.
- The gain is in what kind of error is left: the exit status missed a real failure, and the question's one error was a false alarm.

Not covered: the labels come from one model; the sessions are one person's, who pipes nearly every check; a plain `make test` still rests on the exit status.
