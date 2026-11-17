---
Stable-Id: 01M7KN14X3F4QQBC22MZJBQWJ4
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: chore
Milestone: MILE-5
---
# 5 — Share one ledger format between the plugin and the command

## Outcome

The ledger entry, its formatting and the `/decisions` summary live in one module, so both adapters write entries either can read.

## Acceptance checks

- The plugin and the command call the same ledger code — evidence: code:src/features/stop-check/ledger.ts, code:hooks/register.ts, code:cli/hook.ts
- Existing ledger files still read — evidence: test:tests/ledger.test.ts

## Plan

- [x] Move the ledger entry type and its formatting into `src/features/stop-check/ledger.ts`.
- [x] Leave file access with each adapter.

## Evidence

Done on 2026-11-17 on branch `task-4-command-adapter`.

- The module sits in the stop-check feature folder and not in `src/core/`: an entry is built from the stop check's result, and the core does not import from a feature.
- A check that could not run is now recorded as an entry with a `skipped` reason, by both adapters. `/decisions` leaves these out of the turn count and reports them on their own line.
- A test parses and summarises an entry in the shape written before `provider`, `model` and `harness` existed.
