---
Stable-Id: 01M7MBXQ6XG3P73JJFNHY0KRT5
Status: Done
Kind: chore
Milestone: MILE-12
Date: 2026-11-17
Author: beauwilliams
---
# 21 — Check in CI that each harness loads the plugin from a fresh install

## Outcome

A change that stops Claude Code or Codex loading the plugin fails CI on the pull request that makes it.

## Acceptance checks

- CI installs the plugin from the checkout into a scratch profile for Claude Code and for Codex, at pinned versions, and fails if either does not end up with it — evidence: code:.github/workflows/plugin-load.yml, code:scripts/plugin-load-check.sh
- `claude plugin validate` runs in CI on the manifest and the marketplace file — evidence: code:scripts/plugin-load-check.sh

## Plan

- [x] Add a workflow that runs when a manifest, the hooks or `cli/` changes.

## Evidence

Done on 2026-11-17 on branch `plugin-load-check`, Claude Code 2.1.323 and Codex 0.167.2.

- `make plugin-load` installs the plugin from the checkout into a scratch profile for each harness. For Claude Code it runs `claude plugin validate`, then requires the plugin to be listed as enabled with its hooks module and setup skill present. For Codex it requires the hooks file, the command and the skill in the installed copy, and runs the command once.
- The workflow `plugin loads` runs it on pull requests that touch a manifest, the hooks, `cli/`, `src/` or the skill, and on `main`.

Not covered: it does not start a session in either harness, so it does not prove the hooks fire or that the skill is offered to the agent.
