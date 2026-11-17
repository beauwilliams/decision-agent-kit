---
Stable-Id: 01M7M80VYB6H6ETAXY5KFA4966
Status: Accepted
Date: 2026-11-17
Author: beauwilliams
Deciders: beauwilliams
---
# 10 — The command-line adapter is a TypeScript file run by Node that keeps each turn's events in a file

## Context

Codex runs a hook as a command: it starts a process for each event, writes the event as JSON on standard input and reads JSON from standard output (docs/evidence/TASK-3/). No process lives across events, so nothing is remembered between the prompt, the tool calls and the end of the turn unless it is written down.

The end-of-turn event carries the final message but not the request or the commands. The session file has them, but holds each shell command inside a string of code, in a format that is not documented.

ADR-2 rules out a build step and runtime dependencies.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| A TypeScript file run by Node, collecting events in a file per session | No build; same source the plugin and the replay read; uses only documented hook fields | Needs Node 24; one process start per event |
| The same, reading the session file at the end of the turn | One hook instead of three | Depends on an undocumented file format |
| A compiled single-file binary | Fast start; no Node needed | A build and release pipeline, against ADR-2 |
| A long-running local service the hooks call | No start cost per event | Something to install, start and keep alive |

## Decision

The command-line adapter is `cli/hook.ts`, TypeScript source run by Node 24 with no build, as `eval/` already is.

- For Codex it is delivered as a Codex plugin: `.codex-plugin/plugin.json` names a hooks file, and each hook runs `node "${PLUGIN_ROOT}/cli/hook.ts"`. The repository is its own marketplace, so it installs with `codex plugin marketplace add` and `codex plugin add` (TASK-20). A harness with command hooks and no plugin system registers the same command by hand.

- It is registered on three events: prompt submitted, after a tool call, and stop.
- On the first two it appends the event to `turns/<session>.jsonl` under the kit's state directory. On stop it reads that file, runs the stop check, writes one ledger entry and removes the turn's events.
- The state directory is `$DECISION_AGENT_KIT_HOME`, else the `PLUGIN_DATA` folder the harness gives a plugin, else `$XDG_STATE_HOME/decision-agent-kit`, else `~/.local/state/decision-agent-kit`. The ledger is `ledger/<session>.jsonl` inside it, in the format the plugin writes.
- Settings come from environment variables, since a command hook has no options: `DECISION_AGENT_KIT_STOP_CHECK` (`off`, `shadow`, `on`), `DECISION_AGENT_KIT_PROVIDER`, the provider's own key variable, and `DECISION_AGENT_KIT_KEY_COMMAND`.
- It always exits 0 and never asks the harness to block or continue the turn (ADR-4). In `on` mode it prints a note for the harness to show; otherwise it prints nothing.

## Consequences

- A second harness with command hooks needs only a mapping from its events to the transcript model.
- Turn files hold the person's prompts and command output in plain text until the turn ends. They are written with owner-only permissions and removed at stop; a session that ends without a stop event leaves one behind.
- The plugin's ledger stays under `~/.claude/`, so the two adapters share a format and not a directory.
- Where the harness reports no outcome for a command, the verdict is `unknown` until TASK-19.
- Each event costs a Node start, about 0.15 seconds measured on the development machine.
- The machine running Codex needs Node 24 on its path.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-17 | Initial record. | **structural** |
> | 2026-11-17 | Delivered as a Codex plugin with hooks in its manifest; state under the plugin data folder; measured start cost. | **substantive** |
> | 2026-11-17 | Accepted by beauwilliams in chat after being shown the record in full. The dictated message read "Except ADR 10", in reply to "Reply 'accept ADR-10' and I'll record it"; taken as "Accept ADR 10". | **structural** |
