---
Stable-Id: 01M7MJH21833KMHBXHY19Y0MFR
Status: Open
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

- A check command whose exit status cannot be trusted (a pipe, `;`, `||`, or a later command in the same line) is treated as having no reported outcome, so `check_failed` decides it
- Replay says how many `verified` verdicts change, and how many of the changes the labels support
- The README and the spec say that command output is then sent for Claude Code sessions too

## Plan

- [ ] Decide with the maintainer whether sending check output from Claude Code sessions is acceptable; it is not sent today.
- [ ] Detect the command shapes whose exit status is not the check's.

## Evidence

None yet.
