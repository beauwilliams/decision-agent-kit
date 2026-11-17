---
Stable-Id: 01M7M80VGTM07S5ZNYMPEJ1PNT
Status: Done
Kind: feature
Milestone: MILE-6
Depends-on: TASK-4
Date: 2026-11-17
Author: beauwilliams
---
# 19 — Tell whether a check passed when the harness gives no exit code

## Outcome

In a harness that does not report whether a command succeeded, the stop check still says whether the last check passed.

Codex 0.167.2 passes a shell command's output to a hook with no exit code, and its session file holds none either (docs/evidence/TASK-3/edit-and-check.json: the failing `node --test` and the passing one differ only in their text). Until this is done the command-line adapter reports such a turn as `unknown`.

## Acceptance checks

- A turn whose last check has no reported outcome gets `verified` or `failing_check` from one question about the check's output, and stays `unknown` between the two thresholds — evidence: test:tests/stop-check.test.ts, code:docs/evidence/TASK-19/live-entries.jsonl
- Replay over commands with a recorded exit status says how often the answer is right — evidence: code:docs/evidence/TASK-19/check-outcome-report.txt
- A missing answer leaves the verdict `unknown` and never turns it into `verified` — evidence: test:tests/stop-check.test.ts

## Plan

- [x] Write the question and its `false` criterion, one judgment only.
- [x] Hide the known outcome in replayed Claude Code commands and compare.
- [x] Label the outputs independently, since the exit status turned out not to be the truth.

## Evidence

Done on 2026-11-17 on branch `task-19-check-outcome`.

- The question `check_failed` is asked in the same request as the others, only when the newest check after the last edit has no reported outcome. At or above 0.7 the verdict becomes `failing_check` with a finding from the model; at or below 0.3 it becomes `verified`; otherwise it stays `unknown`.
- Against independent labels on 94 commands, 92 were decided at 0.7 and 0.3: 3 of 25 called failed were labelled passed, and 1 of 67 called passed was labelled failed (`docs/evidence/TASK-19/check-outcome-report.txt`).
- The exit status was the wrong thing to compare with. Of 24 commands labelled failed, 23 exited cleanly, because their output was piped or another command followed. This also means the rule the Claude Code adapter uses, "exit status 0 is a pass", reports `verified` for checks that failed (TASK-23).
- Two live Codex turns, one ending on a failing test and one on a passing test, were recorded as `failing_check` and `verified`.

Not covered: the labels come from one model and no person has checked them; the sample is from one person's sessions; a command's output is now sent to the provider for these turns.
