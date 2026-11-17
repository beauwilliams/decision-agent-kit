# AGENTS.md

A Claude Code plugin that asks SubQ decision models typed questions about an agent session and acts
on the probabilities. Decisions are recorded in `docs/adr/` and managed with `urzua`; read the
accepted records before changing behaviour they cover.

## Rules

- Run everything through `make`. `make ci` must pass before work is called done.
- Never commit to `main`. One pull request per change, from a fresh branch.
- A change in direction gets a record first: `urzua new adr "<the decision as a sentence>"`. Never
  number a record by hand. `make records` must stay clean.
- Work is a task: `urzua new task "<the outcome>"`. Write its acceptance checks before code, add a step to its plan before starting it, and record evidence with the commit it ran against. `urzua roadmap` gives the order of work.
- A feature never acts by default until a record cites replay evidence for it (ADR-3).
- A model answer may make the agent more cautious and never less (ADR-4).
- Nothing under `src/` or `hooks/` uses a Node built-in, a global `fetch` or a timer (ADR-2). The
  lint rules hold this; do not disable them.
- No runtime dependencies.
- No emojis. Comments only where the reason is not obvious from the code.
- The API key never appears in the repository, the ledger, a log line or a test fixture.

## Layout

| Path            | What it holds                                                    |
| --------------- | ---------------------------------------------------------------- |
| `src/core/`     | Transcript model, size estimation, redaction. No I/O.            |
| `src/subq/`     | The SubQ Decisions API client.                                   |
| `src/features/` | One folder per feature: a pure decision function and its policy. |
| `hooks/`        | The Claude Code adapter.                                         |
| `eval/`         | Replay of recorded sessions through a feature.                   |
| `tests/`        | Unit tests.                                                      |
| `docs/adr/`     | Decision records.                                                |
