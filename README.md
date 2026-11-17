# decision-agent-kit

A Claude Code plugin that asks a decision model typed questions about a coding session and acts on
the probabilities. It uses [SubQ](https://subq.ai) Snap today; TypeSafe Jev and Levanto Sage are
planned (ADR-7). A decision model returns a yes/no probability, a
choice or a score, and no generated text, so a check costs about a second and a fraction of a cent.

The first check is the **stop check**: when a turn ends, did the agent really finish?

## The stop check

At the end of each turn the plugin reads what the turn did, without a model:

- which files were edited,
- which test, build or lint commands ran, whether each passed, and whether it ran after the last
  edit.

Rules settle what those facts prove. A check that failed after the last edit is flagged with no
model call. A check that passed after the last edit counts as verified.

SubQ is asked only how the final message reads, and only for a turn that did real work:

| Question                                                                  | Flagged when                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Does the reply claim the change works?                                    | Files were edited and nothing was run afterwards                              |
| Does the reply leave requested work undone, with nothing needed from you? | The reply offers the rest as a next step, or stops to ask whether to continue |

A flagged turn gets a note under the reply. The note never re-prompts the agent and never blocks
anything.

## Modes

Every feature has a mode, set in the plugin's options:

| Mode     | Behaviour                                                    |
| -------- | ------------------------------------------------------------ |
| `off`    | Does not run                                                 |
| `shadow` | Decides and records the decision; shows nothing. The default |
| `on`     | Shows a note under a reply it flags                          |

Decisions are appended to `~/.claude/decision-agent-kit/ledger/<session id>.jsonl`. The ledger holds
verdicts, probabilities and counts, not session text.

`/subq` shows what was decided this session. `/subq good` and `/subq bad` label the last decision,
which is the data thresholds are tuned from.

## Setup

Function hooks are early access in Claude Code:

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
claude --plugin-dir /path/to/decision-agent-kit
```

The SubQ API key is read from the plugin's `apiKey` option, then the `SUBQ_API_KEY` variable, then
the command in `apiKeyCommand`.

## What leaves the machine

The stop check sends SubQ the final message of the turn, the request that started it, and the
check commands that ran. Credential-shaped text is replaced before sending; a secret with no
recognisable shape is not caught. List a directory in `disabledPaths` and sessions started under it
send nothing.

## Development

```sh
make install
make ci        # format, lint, type-check, tests, decision records
make replay    # replay recorded sessions through the stop check; ARGS=--ask sends them to SubQ
```

Decisions are recorded in [`docs/adr/`](docs/adr/) and specifications in [`docs/spec/`](docs/spec/),
managed with [urzua](https://github.com/urzuahq/urzua).

## License

MIT
