---
Stable-Id: 01M7KN16W9G6V6ZG3N624W0JXK
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-8
Depends-on: TASK-8
---
# 9 — Record what compaction would keep and drop

## Outcome

When the harness compacts, the ledger gets the list of items the kit would keep and drop, with the probabilities.

## Acceptance checks

- A compaction in a live session writes the record. Evidence: the ledger file.
- The harness compaction is unchanged. Evidence: the session continues as it does without the plugin.

## Plan

- [ ] Add the feature under `src/features`.
- [ ] Hook the compaction event in shadow mode.

## Evidence

None yet.
