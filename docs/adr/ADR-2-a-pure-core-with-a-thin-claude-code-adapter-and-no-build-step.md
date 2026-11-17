---
Stable-Id: 01M7KAGT5RCWF1FG83TJVCTA8R
Status: Accepted
Date: 2026-11-16
Author: beauwilliams
Deciders: beauwilliams
---
# 2 — A pure core with a thin Claude Code adapter and no build step

## Context

Claude Code loads a plugin's hooks module as TypeScript source. The module runs in an environment with no Node and no DOM: files, network, processes, storage and the clock are reached through the engine interface each hook receives. `hooks/hooks.json` names one module path.

The function-hooks API is early access and moves between releases. The declarations this repository type-checks against are the ones Claude Code 2.1.323 writes.

The same decision logic also has to run outside Claude Code, over recorded sessions, to evaluate it.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| All logic in the hooks module | Fewest files | Cannot run outside the engine; an API change touches everything |
| Pure core with a thin adapter | Logic is testable and replayable in Node; an API change touches one folder | I/O must be injected everywhere |
| Separate published packages | Reusable elsewhere | A build and release pipeline before there is a first feature |

## Decision

One repository, one plugin, five layers:

- `src/core/`: transcript model, size estimation, redaction. No I/O.
- `src/subq/`: the Decisions API client over an injected fetch and sleep.
- `src/features/<name>/`: one folder per feature, each a pure decision function plus its policy.
- `hooks/`: the Claude Code adapter. The only code that imports from `claude-code`.
- `eval/`: a Node command that replays recorded sessions through a feature.

Relative imports carry the `.ts` extension, so the engine, Node 24 and `tsc` read the same files with no build step. There are no runtime dependencies.

## Consequences

- Nothing under `src/` may use a Node built-in, a global `fetch` or a timer; `tsconfig.hooks.json` type-checks `src/` with no Node types to hold that.
- A Claude Code API change is absorbed in `hooks/`.
- Each feature registers its own hooks from the single hooks module.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
