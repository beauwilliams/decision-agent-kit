---
Stable-Id: 01M7KN14X3F4QQBC22MZJBQWJ4
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: chore
Milestone: MILE-5
---
# 5 — Share one ledger format between the plugin and the command

## Outcome

Ledger reading and writing live in the core, so both adapters write entries `/subq` can read.

## Acceptance checks

- The plugin and the command call the same ledger code. Evidence: the diff.
- Existing ledger files still read. Evidence: a test with an old entry.

## Plan

- [ ] Move the ledger entry type and its formatting into `src/core`.
- [ ] Leave file access with each adapter.

## Evidence

None yet.
