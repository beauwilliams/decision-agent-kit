---
Stable-Id: 01M7KB2690EXCE23RT1FKSSYTW
Status: Discussion
Date: 2026-11-16
Author: beauwilliams
---
# 2 — Codebase architecture and engineering conventions

## Summary

How the code is laid out, what it is written in, how it plugs into Claude Code, and the engineering conventions the repository follows.

## Motivation

The plugin API this kit depends on is early access and changes between releases, and the decision logic has to run in two places: inside the agent, and offline over recorded sessions. Both push toward keeping the logic separate from the harness. The layering itself is decided in ADR-2; this RFC records the rest of the engineering setup so it is written down once and can be argued with.

## Proposal

**Language and runtime.** TypeScript, as ES modules, with no runtime dependencies. Claude Code loads the hooks module from source, so there is no build step. Relative imports carry the `.ts` extension so that the engine, Node 24 and the type checker all read the same files.

**Layers** (ADR-2).

| Path | Holds | May do I/O |
|---|---|---|
| `src/core/` | Transcript model, size estimation, redaction | No |
| `src/subq/` | Decisions API client: batching, retries | Through an injected fetch and sleep |
| `src/features/<name>/` | One feature: evidence gathering, questions, policy | No |
| `hooks/` | The Claude Code adapter: events, files, key lookup, ledger | Through the engine interface only |
| `eval/` | Replay of recorded sessions through a feature | Yes (Node) |
| `tests/` | Unit tests | No network |

**How it plugs in.** `.claude-plugin/plugin.json` declares the plugin and its options. `hooks/hooks.json` names one module, `hooks/register.ts`, which registers each feature's hooks: `turn.complete` for the stop check, `command.run` for `/subq`, later `tool.call`, `tool.check` and `session.compact`. Everything outside the module is reached through the engine: network, files, processes, storage.

**The environment constraint.** A hooks module has no Node and no DOM. Lint rules forbid Node built-ins, a global `fetch` and timers under `src/` and `hooks/`, and a second type-check configuration compiles them with no Node types.

**Conventions.**

- Every task runs through `make`. `make ci` runs formatting, lint, type-check, tests and the record check, and is the gate before work is called done.
- pnpm, Node 24 from `.nvmrc`, vitest, ESLint and Prettier.
- One CI workflow with no path filters, actions pinned to commit SHAs, and a single job that requires the others.
- One pull request per change from a fresh branch. Commit subjects are sentences that describe the result.
- `AGENTS.md` holds the rules for agents working here; `CLAUDE.md` points at it.
- MIT license.

**Verifying the plugin.** `claude plugin validate .` checks the manifest and what the module hooks and calls. `claude plugin test` runs hook tests against the engine.

## Open questions

- **`claude plugin validate` in `make ci`.** It passes with warnings today, including type errors from its own compile of `.ts` import extensions. Whether to gate on it, and whether CI has the `claude` binary, is undecided.
- **Hook tests.** No test yet drives the hooks through the engine's test kit.
- **Changesets and a changelog.** Not set up; nothing is released yet.
- **CI has never run.** The workflow is written and the repository has no remote.
- **One plugin or several.** One plugin with a mode per feature today. Splitting into a marketplace of small plugins is possible later.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
