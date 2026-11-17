---
Stable-Id: 01M7KD055YN8KH0DJDFA9E1T1R
Status: Open
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

- [ ] Start a session with the plugin directory loaded and function hooks enabled.
- [ ] Configure the key command.
- [ ] Run the three turns above and read the ledger.

## Evidence

None yet.
