---
Stable-Id: 01M7MCE789CJ7Z46HE6Z8DH5ZQ
Status: Done
Kind: feature
Milestone: MILE-13
Date: 2026-11-17
Author: beauwilliams
---
# 22 — Ship a skill that sets the kit up, and a prompt to paste into an agent

## Outcome

The kit ships a skill as well as hooks. The hooks run the checks, which must not depend on the agent choosing to run them. The skill tells an agent how to install and configure the kit, and the README gives one prompt to paste that points an agent at it.

## Acceptance checks

- The plugin carries a skill that covers install, the key, the modes and how to confirm a check was recorded, for Claude Code and Codex — evidence: code:skills/setup-decision-agent-kit/SKILL.md
- The Codex manifest names the skills folder and the skill's name matches its folder — evidence: test:tests/manifests.test.ts
- The README has a prompt to paste into an agent — evidence: code:README.md
- An agent given only the prompt sets the kit up in a clean profile — evidence: code:docs/evidence/TASK-22/trial.txt

## Plan

- [x] Write the skill from what has been verified, and say what has not.
- [x] Name the skills folder in the Codex manifest; Claude Code finds `skills/` in a plugin by itself.
- [x] Add the prompt to the README.
- [x] Try the prompt in a clean Claude Code profile and a clean Codex profile.

## Evidence

2026-11-17, branch `setup-skill`.

- `claude plugin marketplace add urzuahq/decision-agent-kit` and `claude plugin install decision-agent-kit@decision-agent-kit` succeeded in a scratch profile on Claude Code 2.1.323, and Codex 0.167.2 installed the plugin from the same GitHub address.

- Given only the README prompt in an empty profile, Claude Code (Sonnet) and Codex each fetched the skill, installed the plugin, stopped before touching a key and said what would be sent (`docs/evidence/TASK-22/trial.txt`).

Not covered: whether a harness offers the installed skill to the agent by itself; in both trials the agent read it from its address.
