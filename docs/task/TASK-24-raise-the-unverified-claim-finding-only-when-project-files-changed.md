---
Stable-Id: 01M7MV6X2S6B7CJDG3Q2NFXSPD
Status: Done
Kind: bug
Severity: medium
Milestone: MILE-3
Date: 2026-11-17
Author: beauwilliams
---
# 24 — Raise the unverified claim finding only when project files changed

## Outcome

A reply that says the work is done is flagged as unverified only when the turn changed the project's files. A turn that closed issues or wrote scratch files is not.

Since shell commands that write were counted as edits (TASK-15), any such turn became `unverified`, and its reply was scored on whether it claims success. The replay then counted 10 of 24 claims as missed. Reading them showed none was a code change.

## Acceptance checks

- When the only edits came from shell commands, the model is asked whether they changed project files, and the claim finding is dropped on a clear no — evidence: test:tests/stop-check.test.ts
- A missing answer keeps the finding — evidence: test:tests/stop-check.test.ts
- Replay says how the new question agrees with labels, and what the claim finding misses on the turns it applies to — evidence: code:docs/evidence/TASK-24/replay-report.txt
- The spec and the README say the shell commands are sent — evidence: spec:docs/spec/SPEC-1-stop-check.md, code:README.md

## Plan

- [x] Split the labelled turns by what made the change.
- [x] Add the question and drop the finding on a clear no.
- [x] Label the shell-only turns and compare.

## Evidence

Done on 2026-11-17 on branch `claim-needs-code-change`.

- `changed_code` is asked when every edit in the turn came from a shell command. Below 0.5 the claim finding is not raised.
- It agreed with independent labels on 28 of 28 shell-only turns (`docs/evidence/TASK-24/replay-report.txt`).
- On the turns the finding applies to, 0 of 8 claims were missed at 0.7 and 0 of 4 non-claims were flagged. The earlier "10 of 24 missed" came from turns with no code change.

Not covered: 12 labelled turns is a small sample, the labels are from models, and the shell commands of such a turn are now sent to the provider.
