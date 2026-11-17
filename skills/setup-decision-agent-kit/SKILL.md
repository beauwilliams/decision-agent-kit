---
name: setup-decision-agent-kit
description: Use when the user asks to install, set up, configure, check or remove decision-agent-kit, the plugin that asks a decision model whether a coding agent's turn is really done. Covers Claude Code and Codex, the API key, the modes, and how to confirm it is recording.
---

# Set up decision-agent-kit

decision-agent-kit runs a check when a turn ends. It reads what the turn did (edits, commands run)
and asks a decision model how the final message reads: does it claim the change works, and does it
leave requested work undone? It records the answer in a ledger. In the default mode, `shadow`, it
shows nothing and changes nothing.

It supports two harnesses: Claude Code and Codex. If you are running in another one, say so and
stop; do not improvise an install.

## Rules for you

- Never print, echo or log an API key, and never write one into a repository, a shell history
  line, or a file the user did not choose.
- Ask the user where they keep secrets before touching a key. Prefer a command that reads the key
  from their password manager over a key stored in a file.
- Leave the mode at `shadow` unless the user asks for `on`.
- Tell the user what leaves the machine (see the end) before the first check runs.

## 1. Work out which harness you are in

Ask yourself which program is running you. If unsure, ask the user. Then follow one section.

## 2a. Claude Code

The kit uses function hooks, which are early access. They load only when
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set in the environment Claude Code starts in.

```sh
claude plugin marketplace add urzuahq/decision-agent-kit
claude plugin install decision-agent-kit@decision-agent-kit
```

Then have the user add `export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` to their shell profile and
restart Claude Code.

Settings are plugin options, set with `/plugin configure decision-agent-kit@decision-agent-kit`:

| Option          | Values                    | Default  |
| --------------- | ------------------------- | -------- |
| `stopCheck`     | `off`, `shadow`, `on`     | `shadow` |
| `provider`      | `subq`, `jev`, `sage`     | `subq`   |
| `apiKeyCommand` | a command that prints key | unset    |
| `disabledPaths` | comma-separated folders   | unset    |

Check it: after one turn that edits a file, the user runs `/decisions`. It should report one turn
checked.

## 2b. Codex

Codex needs Node 24 or newer on its path. Check with `node --version` first; if it is older or
missing, tell the user and stop.

```sh
codex plugin marketplace add urzuahq/decision-agent-kit
codex plugin add decision-agent-kit@decision-agent-kit
```

Codex asks the user to review a plugin's hooks before it runs them. The hooks run one command,
`cli/hook.ts`, when a prompt is sent, after each tool call and when the turn ends.

Settings are environment variables, set where Codex starts:

| Variable                         | Values                    | Default  |
| -------------------------------- | ------------------------- | -------- |
| `DECISION_AGENT_KIT_STOP_CHECK`  | `off`, `shadow`, `on`     | `shadow` |
| `DECISION_AGENT_KIT_PROVIDER`    | `subq`, `jev`, `sage`     | `subq`   |
| `DECISION_AGENT_KIT_KEY_COMMAND` | a command that prints key | unset    |

If Codex's `config.toml` filters the environment (`[shell_environment_policy]`), the key variable
and these settings must be allowed through.

Check it: after one turn that edits a file, list
`~/.codex/plugins/data/decision-agent-kit-decision-agent-kit/ledger/`. There should be one file for
the session, with one line for the turn. A line with a `skipped` field gives the reason the check
could not run.

## 3. The API key

Each provider reads its own variable, and only that one:

| Provider | Model        | Key variable      |
| -------- | ------------ | ----------------- |
| `subq`   | SubQ Snap    | `SUBQ_API_KEY`    |
| `jev`    | TypeSafe Jev | `JEV_API_KEY`     |
| `sage`   | Levanto Sage | `LEVANTO_API_KEY` |

Only SubQ Snap has been called from the kit so far. Jev and Sage are configured from their
documentation.

Offer the user two ways and let them choose:

1. A key command, such as their password manager's read command. The key is never stored by the
   kit. Set it as `apiKeyCommand` (Claude Code) or `DECISION_AGENT_KIT_KEY_COMMAND` (Codex).
2. The provider's key variable, exported in the shell that starts the harness.

With no key the kit does nothing harmful: the check is skipped and the ledger says why.

## 4. Tell the user what to expect

- `shadow` records and shows nothing. `on` shows a note under a reply the check flags. Neither can
  block the agent or make it continue.
- Sent to the provider for each checked turn: the final message, the request that started the turn,
  the test and build commands that were run, and shell commands that wrote files. Text shaped like a credential is replaced first; a secret with no
  recognisable shape is not caught.
  File contents are not sent. An excerpt of the last test or build output is sent when the kit
  cannot tell whether it passed: always in Codex, and in Claude Code when the command was piped or
  chained.
- A turn that changed no files and made fewer than three tool calls is not sent at all.

## Removing it

- Claude Code: `claude plugin uninstall decision-agent-kit@decision-agent-kit`
- Codex: `codex plugin remove decision-agent-kit@decision-agent-kit`

To pause it without removing it, set the mode to `off`.
