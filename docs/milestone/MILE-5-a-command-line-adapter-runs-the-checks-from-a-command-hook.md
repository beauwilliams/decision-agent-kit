---
Stable-Id: 01M7KN0ZBXJWHSSWGYD3D5C5TS
Status: Planned
Date: 2026-11-17
Author: beauwilliams
Epic: EPIC-2
Depends-on: MILE-4
---
# 5 — A command-line adapter runs the checks from a command hook

## Outcome

One command reads a hook event, runs the same core the plugin runs, writes to the same ledger and prints what the harness expects.

## Done means

- The command runs the stop check on a recorded event and writes a ledger entry. Evidence: a test that does this.
- No code under `src/` changed to make it work, beyond new exports. Evidence: the diff.
- An ADR records how the adapter is run and packaged. Evidence: the ADR.
