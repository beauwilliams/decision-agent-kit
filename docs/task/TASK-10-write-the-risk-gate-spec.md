---
Stable-Id: 01M7KN17AX592TQRGKNTQ257HC
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-10
---
# 10 — Write the risk gate spec

## Outcome

A spec defines which commands are judged, what the model is asked, and how the answer can only add a prompt.

## Acceptance checks

- The spec names the Claude Code event used, checked against the installed version — evidence: spec:docs/spec/SPEC-3-risk-gate.md
- The spec states the time limit and what happens when it passes — evidence: spec:docs/spec/SPEC-3-risk-gate.md

## Plan

- [x] Check what the permission event allows.
- [x] Write the spec.

## Evidence

Done on 2026-11-17 on branch `task-10-risk-gate-spec`. SPEC-3 is a Draft; accepting it is the maintainer's.

- Claude Code 2.1.323: `tool.check` gives a hook the harness's verdict through `next(e)` and accepts any `{ decision }` in return, so an `allow` can be raised to `ask` (read from the hook type declarations the installed version writes).
- Codex 0.167.2: the binary rejects `permissionDecision:ask` and `permissionDecision:allow` from a `PreToolUse` hook as unsupported and accepts `deny` with a reason. A hook there cannot add a prompt, so the gate is shadow only in Codex.
