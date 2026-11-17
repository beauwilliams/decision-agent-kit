---
Stable-Id: 01M7MBXPF7EG86K7TCQE0955TW
Status: Done
Kind: feature
Milestone: MILE-6
Depends-on: TASK-4
Date: 2026-11-17
Author: beauwilliams
---
# 20 — Install in Codex as a plugin from the repository

## Outcome

`codex plugin marketplace add urzuahq/decision-agent-kit` followed by `codex plugin add decision-agent-kit@decision-agent-kit` installs the kit, and its hooks run with nothing copied by hand.

## Acceptance checks

- Codex installs the plugin from the repository's marketplace file — evidence: code:docs/evidence/TASK-20/install.txt
- A session with only the plugin installed writes a stop check entry — evidence: code:docs/evidence/TASK-20/live-entry.jsonl
- The manifests agree on name and version, and the hooks name a command that exists — evidence: test:tests/manifests.test.ts
- State is kept in the folder Codex gives the plugin — evidence: test:tests/cli-hook.test.ts

## Plan

- [x] Add `.codex-plugin/plugin.json` with a `hooks` entry, and the hooks file.
- [x] Add `.claude-plugin/marketplace.json`, which Codex also reads.
- [x] Keep state under `PLUGIN_DATA` when it is set.

## Evidence

Done on 2026-11-17 on branch `codex-plugin`, Codex 0.167.2.

- A Codex plugin manifest can name a hooks file, and Codex runs those hooks with `PLUGIN_ROOT` and `PLUGIN_DATA` set (`docs/evidence/TASK-20/install.txt`). The hook command is `node "${PLUGIN_ROOT}/cli/hook.ts"`.
- Installed from the checkout into a scratch Codex home with no other hooks, a live `codex exec` session wrote `docs/evidence/TASK-20/live-entry.jsonl`: one edit, nothing run, verdict `unverified`, "claims it works" 0.02 for a reply that said it had not been verified.

Not covered: installing from the GitHub address (the install was from a local folder), the prompt Codex shows to trust a plugin's hooks (the run bypassed it), and an interactive session.
