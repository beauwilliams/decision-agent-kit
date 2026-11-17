---
Stable-Id: 01M7KN14CK6DHF8BJEQAMQMQ5F
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-5
Depends-on: TASK-3
---
# 4 — Run a hook event through the stop check from a command

## Outcome

A command reads a hook event on standard input, runs the stop check and writes a ledger entry.

## Acceptance checks

- Given a recorded end-of-turn event, the command writes one stop check entry — evidence: test:tests/cli-hook.test.ts, code:docs/evidence/TASK-4/live-entry.jsonl
- With no API key it exits cleanly and says why — evidence: test:tests/cli-hook.test.ts
- The key appears in no output or ledger entry — evidence: test:tests/cli-hook.test.ts

## Plan

- [x] Decide how the command is run with no build step (ADR-10).
- [x] Map the event to the transcript model.
- [x] Supply fetch, sleep and file access from Node.

## Evidence

Done on 2026-11-17 on branch `task-4-command-adapter`, Codex 0.167.2.

- `cli/hook.ts` reads one hook event on standard input. It keeps the prompt and each tool call in a file until the stop event, then runs the stop check and appends one ledger entry (ADR-10). `cli/codex.ts` maps Codex's events to the transcript model.
- A test feeds the eight events of a recorded Codex turn (`tests/fixtures/codex-turn.json`, the capture from TASK-3) and reads back one entry. Others cover no key, a key the server echoes back in an error, each mode, and a session id that is not a file name.
- A live `codex exec` session with the hook registered and SubQ as the model wrote `docs/evidence/TASK-4/live-entry.jsonl`: one edit, nothing run after it, verdict `unverified`, model asked, nothing flagged. The reply said nothing was run, and "claims it works" scored 0.05.
- With no key the command exits 0, prints the variable to set on standard error and records a `skipped` entry.

Not covered: an interactive Codex session, and whether Codex shows the note printed in `on` mode (TASK-3). A check command's result is `unknown` on Codex (TASK-19).
