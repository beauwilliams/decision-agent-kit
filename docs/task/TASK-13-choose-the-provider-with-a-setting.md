---
Stable-Id: 01M7KQZHTFE7J2E8AS7MX9V33M
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-15
---
# 13 — Choose the provider with a setting

## Outcome

A `provider` setting selects the base URL, pinned model, key source and request limit, with SubQ as the default.

## Acceptance checks

- Each provider resolves to its documented base URL and pinned model — evidence: test:tests/providers.test.ts
- An error body whose `detail` is a string is read as well as one whose `detail` is an object — evidence: test:tests/client.test.ts
- The ledger entry records the provider and model — evidence: code:docs/evidence/TASK-13/live-entry.jsonl
- The key for one provider is never sent to another — evidence: test:tests/providers.test.ts

## Plan

- [x] Hold the three providers as data beside the client.
- [x] Add the setting and a key setting per provider.
- [x] Read both error shapes.

## Evidence

Done on 2026-11-17 on branch `provider-setting`.

- A `provider` setting chooses SubQ Snap, TypeSafe Jev or Levanto Sage; SubQ is the default. A provider is data in `src/decision/providers.ts`.
- Only the chosen provider's key variable is read. A test sends a request as Jev with a SubQ key present and checks the SubQ key is absent from what was sent.
- A live Claude Code session on SubQ wrote the entry in `docs/evidence/TASK-13/live-entry.jsonl`, with `provider` and `model`, and `/decisions` named the model.
- The command is `/decisions` and the client lives in `src/decision/` (ADR-9).

Not covered: Jev and Sage have not been called. Their addresses, models and limits come from documentation (TASK-14).
