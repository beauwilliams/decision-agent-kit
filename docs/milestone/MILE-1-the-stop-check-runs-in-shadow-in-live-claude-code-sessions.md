---
Stable-Id: 01M7KD04Q7F00ZWV748HS7Y398
Status: Planned
Date: 2026-11-17
Author: beauwilliams
Epic: EPIC-1
Implements: SPEC-1
---
# 1 — The stop check runs in shadow in live Claude Code sessions

## Outcome

With the plugin loaded and the stop check in shadow mode, every turn that did real work leaves a decision in the ledger, and `/subq` reports it.

## Done means

- A live Claude Code session writes a stop check entry to the ledger. Evidence: the ledger file from that session.
- `/subq` shows the count and the last decision. Evidence: the command's output in that session.
- The API key is resolved from a command and appears in no file or log. Evidence: a search of the ledger and the debug log.
