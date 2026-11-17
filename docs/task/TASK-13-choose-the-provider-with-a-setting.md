---
Stable-Id: 01M7KQZHTFE7J2E8AS7MX9V33M
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-15
---
# 13 — Choose the provider with a setting

## Outcome

A `provider` setting selects the base URL, pinned model, key source and request limit, with SubQ as the default.

## Acceptance checks

- Each provider resolves to its documented base URL and pinned model. Evidence: a test.
- An error body whose `detail` is a string is read as well as one whose `detail` is an object. Evidence: a test.
- The ledger entry records the provider and model. Evidence: a test.
- The key for one provider is never sent to another. Evidence: a test.

## Plan

- [ ] Hold the three providers as data beside the client.
- [ ] Add the setting and a key setting per provider.
- [ ] Read both error shapes.

## Evidence

None yet.
