---
Stable-Id: 01M7KWF5NJ5BPTZJ9G65EW6714
Status: Accepted
Date: 2026-11-17
Author: beauwilliams
Deciders: beauwilliams
---
# 9 — The kit is named decision-agent-kit

## Context

The kit was named `subq-agent-kit` when it targeted one decision model. ADR-7 added two more and left the name as a separate decision. Nobody has installed the plugin yet, so a rename costs nothing now and would break installs later.

A search on 2026-11-17 found no package or repository named `decision-agent-kit`, and no other kit that gives coding agents decision-model checks across several models.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep `subq-agent-kit` | No change | Names one of three supported models |
| `decision-agent-kit` | Says what it is: decision models for coding agents; the name is free | "Decision" also suggests decision records |
| Narrow the kit back to SubQ | The name would fit | Reverses ADR-7 |

## Decision

The repository, the package and the plugin are named `decision-agent-kit`. The ledger moves to `~/.claude/decision-agent-kit/ledger/`.

## Consequences

- The repository's old address redirects. Ledger files written under the old folder stay where they are and are not read.
- Records and evidence files written before the rename keep the old name where they quote it.
- The `/subq` command and the `src/subq/` folder still carry the old name. They change with the provider setting (TASK-13), when the command can report which model answered.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-17 | Initial record. Decided by beauwilliams in conversation on 2026-11-17 ("rename it and the repo", after the name `decision-agent-kit` was proposed); the record was written by an agent on that instruction. | **structural** |
