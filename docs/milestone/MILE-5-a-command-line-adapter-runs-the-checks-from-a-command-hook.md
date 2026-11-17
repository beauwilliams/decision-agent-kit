---
Stable-Id: 01M7KN0ZBXJWHSSWGYD3D5C5TS
Status: InProgress
Date: 2026-11-17
Author: beauwilliams
Epic: EPIC-2
Depends-on: MILE-4
---
# 5 — A command-line adapter runs the checks from a command hook

## Outcome

One command reads a hook event, runs the same core the plugin runs, writes a ledger in the same format and prints what the harness expects.

## Done means

- The command runs the stop check on a recorded event and writes a ledger entry. Evidence: a test that does this.
- No decision logic under `src/` changed to make it work, beyond new exports, the ledger format moving into the core, and a verdict for a check whose outcome the harness does not report. Evidence: the diff.
- An ADR records how the adapter is run and packaged. Evidence: the ADR.
