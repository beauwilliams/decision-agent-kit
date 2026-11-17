---
Stable-Id: 01M7MBXQ6XG3P73JJFNHY0KRT5
Status: Open
Kind: chore
Milestone: MILE-12
Date: 2026-11-17
Author: beauwilliams
---
# 21 — Check in CI that each harness loads the plugin from a fresh install

## Outcome

A change that stops Claude Code or Codex loading the plugin fails CI on the pull request that makes it.

## Acceptance checks

- CI installs the plugin from the checkout into a scratch profile for Claude Code and for Codex, at pinned versions, and fails if either does not list it
- `claude plugin validate` runs in CI on the manifest and the marketplace file

## Plan

- [ ] Add a workflow that runs when a manifest, the hooks or `cli/` changes.

## Evidence

None yet.
