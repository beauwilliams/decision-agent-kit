---
Stable-Id: 01M7KRZQYVM5M396FN9W4VMR2X
Status: Proposed
Date: 2026-11-17
Author: beauwilliams
Deciders: beauwilliams
---
# 8 — Each acceptance check cites evidence kept in the repository

## Context

TASK-1 was nearly set to Done with evidence for one of its three acceptance checks. The record check would have passed, because the checks and the evidence were prose it did not read.

The record tool can read a task's acceptance checks as a list, require each item to end with an evidence clause that names a file, a test or a record, and compute the status from the items. A status that disagrees is an error that names each unmet item.

Most evidence so far is the result of a live run: a ledger entry, a line of a debug log, a replay report. None of it is in the repository, so an item cannot name it. Replay rows hold text from private sessions and must not be committed.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Keep checks and evidence as prose | Nothing to change | The mistake that nearly happened stays possible |
| Items cite evidence; live-run evidence stays outside the repository and is waived | No evidence files to curate | Most items would be waivers, which report as information and prove nothing |
| Items cite evidence; live-run evidence is committed with private text removed | Every item of a finished task points at something a reader can open | Someone has to decide what is safe to commit, each time |

## Decision

Each acceptance check of a task ends with ` — evidence: ` and a locator: `code:<path>`, `test:<path>` or a record's path. A task is Done only when every item resolves or is waived, and the record check enforces it.

Evidence from a live run is committed under `docs/evidence/<record id>/`. Before it is committed, anything that came from a session's content is removed: prompts, replies, file contents, paths outside this repository. Counts, verdicts, probabilities, timings and the tool's own log lines may stay. The API key never appears.

An observation that cannot be made safe to commit, or that leaves nothing to commit, is waived: ` — waived: manual-observation -- <what was seen, when>`. A waiver is a statement that the item was not shown by evidence.

## Consequences

- A task cannot reach Done with an item nobody addressed.
- The check proves each item cites something that exists. It does not prove the cited file shows the item was met; that still rests on the author and the reviewer.
- Evidence files are small and reviewed like code. Raw replay output stays in `eval/out/`, which is not committed.
- Tasks written before this record keep prose checks until they are worked on, and are rewritten then.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-17 | Initial record. | **structural** |
