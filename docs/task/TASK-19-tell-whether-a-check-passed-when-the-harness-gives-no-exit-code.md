---
Stable-Id: 01M7M80VGTM07S5ZNYMPEJ1PNT
Status: Open
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

- A turn whose last check has no reported outcome gets `verified` or `failing_check` from one question about the check's output, and stays `unknown` between the two thresholds
- Replay over turns with a known exit code says how often the answer agrees with it
- A failed call to the model leaves the verdict `unknown` and never turns it into `verified`

## Plan

- [ ] Write the question and its `false` criterion, one judgment only.
- [ ] Hide the known outcome in replayed Claude Code turns and compare.

## Evidence

None yet.
