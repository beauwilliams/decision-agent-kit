---
Stable-Id: 01M7KN15VZVMQFP0NH220V1QC9
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-7
Depends-on: TASK-6
---
# 7 — Record what trimming would cut from each tool result

## Outcome

In shadow mode, each large tool result gets a ledger entry with what would be cut and the tokens saved.

## Acceptance checks

- A result under the size limit makes no request. Evidence: a test.
- A large result records its decision and saving. Evidence: a test.
- Content is redacted before it is sent (ADR-5). Evidence: a test.

## Plan

- [ ] Add the feature under `src/features`.
- [ ] Register it in the plugin with a mode setting.

## Evidence

None yet.
