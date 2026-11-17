# decision-agent-kit

Tooling that lets a coding agent's harness ask a decision model about the session and act on the
answer. A decision model returns a yes/no probability, a choice or a score, and no generated text,
so a check costs about a second and a fraction of a cent.

The kit is built to work across harnesses and across decision models. One core holds the checks;
each harness gets a thin adapter, and each model is a base address, a model name and a key.

| Harness     | Status                                              |
| ----------- | --------------------------------------------------- |
| Claude Code | Works, as a plugin (function hooks, early access)   |
| Codex       | Planned: a command its hooks call (EPIC-2)          |
| Others      | Any harness that can run a command when a turn ends |

| Decision model | Status                                            |
| -------------- | ------------------------------------------------- |
| SubQ Snap      | Works; the default                                |
| TypeSafe Jev   | Configured from its documentation, not yet called |
| Levanto Sage   | Configured from its documentation, not yet called |

| Check                                | Status                           |
| ------------------------------------ | -------------------------------- |
| Stop check: is the turn really done? | Works, in shadow mode by default |
| Trimming tool output as it arrives   | Planned (EPIC-3)                 |
| Compaction that keeps items verbatim | Planned, shadow only (EPIC-3)    |
| Risk gate on shell commands          | Planned (EPIC-4)                 |

The plan is in [`docs/epic/`](docs/epic/), and what each check has been measured to do is in its
spec.

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

Function hooks are early access in Claude Code:

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
claude --plugin-dir /path/to/decision-agent-kit
```

The `provider` option picks the decision model: `subq` (the default), `jev` or `sage`. Each
provider is a URL, a pinned model and a key variable. The `model` option overrides the pinned model.

| Provider | Name         | Key variable      | Status                                 |
| -------- | ------------ | ----------------- | -------------------------------------- |
| `subq`   | SubQ Snap    | `SUBQ_API_KEY`    | Called from this repository            |
| `jev`    | TypeSafe Jev | `JEV_API_KEY`     | From its documentation, not yet called |
| `sage`   | Levanto Sage | `LEVANTO_API_KEY` | From its documentation, not yet called |

The key is read from the plugin's `apiKey` option, then the chosen provider's variable, then the
command in `apiKeyCommand`. Only the chosen provider's variable is read.

## What leaves the machine

The stop check sends the chosen provider the final message of the turn, the request that started it, and the
check commands that ran. Credential-shaped text is replaced before sending; a secret with no
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
