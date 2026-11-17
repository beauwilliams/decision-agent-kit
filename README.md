# decision-agent-kit

Tooling that lets a coding agent's harness ask a decision model about the session and act on the
answer. A decision model returns a yes/no probability, a choice or a score, and no generated text,
so a check costs about a second and a fraction of a cent.

The kit is built to work across harnesses and across decision models. One core holds the checks;
each harness gets a thin adapter, and each model is a base address, a model name and a key.

| Harness     | Status                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| Claude Code | Works, as a plugin (function hooks, early access)                                   |
| Codex       | Works, as a plugin (command hooks); shadow only, untested in an interactive session |
| Others      | Any harness that can run a command when a turn ends                                 |

| Decision model | Status                                            |
| -------------- | ------------------------------------------------- |
| SubQ Snap      | Works; the default                                |
| TypeSafe Jev   | Configured from its documentation, not yet called |
| Levanto Sage   | Configured from its documentation, not yet called |

| Check                                | Status                           |
| ------------------------------------ | -------------------------------- |
| Stop check: is the turn really done? | Works, in shadow mode by default |
| Trimming tool output as it arrives   | Measured and parked (SPEC-2)     |
| Compaction that keeps items verbatim | Planned, shadow only (EPIC-3)    |
| Risk gate on shell commands          | Measured and parked (SPEC-3)     |

The plan is in [`docs/epic/`](docs/epic/), and what each check has been measured to do is in its
spec.

Trimming and the risk gate were built as far as a decision function and replayed over recorded
sessions. Neither earned a place: trimming cut no better than keeping the first and last lines, and
the sessions held almost nothing for the risk gate to catch. Both are switched off and not wired
into any harness.

## Quick start

Paste this into your coding agent (Claude Code or Codex):

```text
Set up decision-agent-kit for the harness you are running in. Read
https://raw.githubusercontent.com/urzuahq/decision-agent-kit/main/skills/setup-decision-agent-kit/SKILL.md
and follow it. Ask me before you touch an API key.
```

The agent installs the plugin, asks where your key lives, and shows you how to confirm a check was
recorded. The same steps, by hand, are below. Once installed, the plugin carries that skill, so
"set up decision-agent-kit" also works later.

## The stop check

At the end of each turn the kit reads what the turn did, without a model:

- which files were edited,
- which test, build or lint commands ran, whether each passed, and whether it ran after the last
  edit.

Rules settle what those facts prove. A check that failed after the last edit is flagged with no
model call. A check that passed after the last edit counts as verified.

The model is asked only how the final message reads, and only for a turn that did real work:

| Question                                                                  | Flagged when                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Does the reply claim the change works?                                    | Files were edited and nothing was run afterwards                              |
| Does the reply leave requested work undone, with nothing needed from you? | The reply offers the rest as a next step, or stops to ask whether to continue |

A flagged turn gets a note under the reply. The note never re-prompts the agent and never blocks
anything.

Measured on replayed sessions (SPEC-1): both questions rarely speak when nothing is wrong, and both
miss a share of real cases. That is why the default is shadow mode.

## Modes

Every check has a mode, set in the plugin's options:

| Mode     | Behaviour                                                    |
| -------- | ------------------------------------------------------------ |
| `off`    | Does not run                                                 |
| `shadow` | Decides and records the decision; shows nothing. The default |
| `on`     | Shows a note under a reply it flags                          |

Decisions are appended to `~/.claude/decision-agent-kit/ledger/<session id>.jsonl`. The ledger holds
verdicts, probabilities and counts, not session text.

`/decisions` shows what was decided this session. `/decisions good` and `/decisions bad` label the last decision,
which is the data thresholds are tuned from.

## Setup: Claude Code

Function hooks are early access in Claude Code, so they load only with a variable set:

```sh
claude plugin marketplace add urzuahq/decision-agent-kit
claude plugin install decision-agent-kit@decision-agent-kit
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
```

The install has been run on Claude Code 2.1.323. The checks themselves have been run from a
checkout (`claude --plugin-dir /path/to/decision-agent-kit`), not yet from a marketplace install.

The `provider` option picks the decision model: `subq` (the default), `jev` or `sage`. Each
provider is a URL, a pinned model and a key variable. The `model` option overrides the pinned model.

| Provider | Name         | Key variable      | Status                                 |
| -------- | ------------ | ----------------- | -------------------------------------- |
| `subq`   | SubQ Snap    | `SUBQ_API_KEY`    | Called from this repository            |
| `jev`    | TypeSafe Jev | `JEV_API_KEY`     | From its documentation, not yet called |
| `sage`   | Levanto Sage | `LEVANTO_API_KEY` | From its documentation, not yet called |

The key is read from the plugin's `apiKey` option, then the chosen provider's variable, then the
command in `apiKeyCommand`. Only the chosen provider's variable is read.

## Setup: Codex

The kit installs as a Codex plugin (verified against Codex 0.167.2). It needs Node 24 on the path;
there is no build step.

```sh
codex plugin marketplace add urzuahq/decision-agent-kit
codex plugin add decision-agent-kit@decision-agent-kit
```

Then export the chosen provider's key variable (`SUBQ_API_KEY` by default), or set
`DECISION_AGENT_KIT_KEY_COMMAND` to a command that prints the key. Codex asks you to review a
plugin's hooks before it runs them.

The plugin registers one command, `cli/hook.ts`, on three hook events. To register it by hand
instead, copy [`examples/codex-hooks.json`](examples/codex-hooks.json) into Codex's `hooks.json`.

Settings are environment variables: `DECISION_AGENT_KIT_STOP_CHECK` (`off`, `shadow` or `on`;
shadow is the default), `DECISION_AGENT_KIT_PROVIDER` (`subq`, `jev` or `sage`) and
`DECISION_AGENT_KIT_KEY_COMMAND`.

Decisions are appended to `ledger/<session id>.jsonl` in the state directory: the plugin's data
folder under `~/.codex/plugins/data/`, or `$DECISION_AGENT_KIT_HOME` when that is set. Registered by
hand, it is `~/.local/state/decision-agent-kit`. Entries carry `"harness": "codex"`.
A check that could not run (no key, timeout, an error from the provider) is recorded as an entry
with a `skipped` reason, and the reason is printed on standard error.

Codex reports a shell command's output with no exit code, so a test or build run after the last edit
has no outcome the kit can read. The decision model is asked whether the check's output shows a
failure, and the verdict becomes `failing_check`, `verified`, or stays `unknown` when the answer is
in between. The plugin has been installed from GitHub, and run with `codex exec`
from a local install; an interactive session is untested.

Between events the turn's prompt and command output are kept in
`<state directory>/turns/<session id>.jsonl`, readable by the owner only, and removed when the turn
ends.

## What leaves the machine

The stop check sends the chosen provider the final message of the turn, the request that started it, and the
check commands that ran. Where it cannot tell whether the last check passed, it also sends an excerpt of that check's
output, up to 4,000 characters. That is every check in Codex, which reports no exit status, and in
Claude Code any check run behind a pipe, `;`, `||` or a new line, where the exit status may not be
the check's. Credential-shaped text is replaced before sending; a secret with no
recognisable shape is not caught. List a directory in `disabledPaths` and sessions started under it
send nothing. The ledger records which provider and model each decision used.

## Development

```sh
make install
make ci        # format, lint, type-check, tests, decision records
make replay    # replay recorded sessions through the stop check; ARGS=--ask sends them to the provider; add --provider jev or sage
```

Decisions are recorded in [`docs/adr/`](docs/adr/) and specifications in [`docs/spec/`](docs/spec/),
managed with [urzua](https://github.com/urzuahq/urzua).

## License

MIT
