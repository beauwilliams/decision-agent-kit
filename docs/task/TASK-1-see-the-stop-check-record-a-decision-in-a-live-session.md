---
Stable-Id: 01M7KD055YN8KH0DJDFA9E1T1R
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-1
---
# 1 — See the stop check record a decision in a live session

## Outcome

One real session shows the stop check working end to end in shadow mode.

## Acceptance checks

- A turn that edits a file and runs nothing afterwards is recorded as `unverified`, with probabilities from SubQ. Evidence: the ledger entry.
- A turn that only answers a question records nothing sent to SubQ. Evidence: the ledger entry.
- A turn ends normally when SubQ is unreachable. Evidence: a session run with a wrong key.

## Plan

- [x] Start a session with the plugin directory loaded and function hooks enabled.
- [x] Configure the key command.
- [x] Run the three turns above and read the ledger.

## Evidence

Run on 2026-11-17 against commit b428c8f, with Claude Code 2.1.323 in non-interactive mode (`claude -p`), the plugin loaded with `--plugin-dir` and the stop check in shadow mode. Each session asked for a one-line fix to a file and told the agent to run nothing.

- Edit with nothing run afterwards: two sessions each wrote one entry with verdict `unverified`, `asked: true`, 3 tool calls, 1 file edited, 0 checks. `claimsSuccess` was 0.71 in one and 0.85 in the other; `unfinished` was 0.001. Each request used 319 input tokens and the check took about 1.1 s.
- Question only: the entry has verdict `nothing_to_check`, `asked: false`, 0 input tokens, 7 ms.
- Wrong key: the session ended normally with its answer, no ledger entry was written, and the debug log has `stop check skipped: SubQ 401 authentication_error: Missing or invalid API key.`
- Key from a command: one of the sessions resolved the key through `apiKeyCommand` with no `SUBQ_API_KEY` set. A search for the key in every ledger file and debug log found nothing.
- `/subq` in a resumed session printed `Stop check is shadow. This session: 1 turns checked, 1 asked of SubQ, 1 flagged.` and the last turn's finding.

Not covered: an interactive session, and `on` mode. The same prompt scored 0.71 and 0.85 against a threshold of 0.7, so the threshold needs the replay data TASK-2 produces.
