---
Stable-Id: 01M7KN15D8MNP9VHKZVNPAWK57
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-7
---
# 6 — Write the spec for trimming tool output

## Outcome

A spec says which tool results are trimmed, what the model is asked, and what is never cut.

## Acceptance checks

- The spec names the Claude Code event that lets a plugin see or change a tool result, checked against the installed version — evidence: spec:docs/spec/SPEC-2-trimming-tool-output.md
- Errors and lines that name a path are listed as never cut, and a result is trimmed only as it arrives — evidence: spec:docs/spec/SPEC-2-trimming-tool-output.md
- The spec says how a cut item can be fetched again — evidence: spec:docs/spec/SPEC-2-trimming-tool-output.md

## Plan

- [x] Check what the tool events allow.
- [x] Write the spec.

## Evidence

Done on 2026-11-17 on branch `task-6-trimming-spec`. SPEC-2 is a Draft; accepting it is the maintainer's.

- Claude Code 2.1.323: the `tool.call` event wraps the tool, so a hook gets the result from `next(e)` and can return `{ result }` in its place (read from the hook type declarations the installed version writes). Codex 0.167.2: `PostToolUse` carries the output; its output schema allows added context and a replacement for an MCP tool's output only (read from the binary), so Codex is shadow only.
- The third check first read "the newest results are never cut". Trimming at arrival means every result is the newest when it is trimmed, so the spec says instead that nothing already in the conversation is ever changed.
- Recorded sessions: `Bash` is 79% of tool output, and the 40 `Bash` results of 8,000 characters or more are 31% of it.
