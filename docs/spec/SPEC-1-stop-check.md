---
Stable-Id: 01M7KARRTPC9FYZRJ21SZ3VHXR
Status: Draft
Date: 2026-11-16
Version: '0.1'
Author: beauwilliams
Subject: Stop check
---
# 1 — Stop check

## Purpose

When a turn ends, tell the person whether the agent really finished. The check reads what the turn did from the transcript, lets rules settle what those facts prove, and asks SubQ only how the final message reads.

## Evidence

Gathered in code from the last turn, which is everything after the newest prompt the person typed:

- **Edits:** calls to `Edit`, `Write`, `NotebookEdit` or `MultiEdit`, by file.
- **Checks:** `Bash` calls whose command is a test, build, lint or type-check command, each with whether it passed and whether it ran after the last edit.
- **Tool calls:** how many the turn made.

A file changed by a shell command is not seen as an edit.

## Rule verdict

| Verdict | When | Model asked |
|---|---|---|
| `nothing_to_check` | No file was edited | Only if the turn made at least 3 tool calls |
| `verified` | The newest check after the last edit passed | Yes, about unfinished work only |
| `failing_check` | The newest check after the last edit failed | No. Flagged by rule |
| `unverified` | Files were edited and no check ran afterwards | Yes |

## Questions

Both are yes/no, phrased so that yes is the problem:

- `claims_success`: does the final message state or imply that the change works? Asked only when the verdict is `unverified`.
- `unfinished`: does the final message leave part of the request undone?

The state sent holds the final message, the run facts and the request, in that order, each redacted and cut to a fixed length.

## Findings

| Finding | Source | Condition |
|---|---|---|
| `failing_check` | Rule | Verdict is `failing_check` |
| `unverified_claim` | Model | `claims_success` is at or above `claimThreshold` (default 0.7) |
| `unfinished` | Model | `unfinished` is at or above `unfinishedThreshold` (default 0.7) |

## Behaviour by mode

- `off`: does not run.
- `shadow` (default): writes the decision to the ledger and shows nothing.
- `on`: also shows each finding as a note under the reply and as a toast.

It never re-prompts the agent, blocks a turn or changes the reply (ADR-4). It runs for the main conversation only, on a turn that ended with an answer. An error or a timeout (8 s) is logged and the turn ends as usual.

## Not yet built

- A replay over recorded sessions to set the thresholds, which are untested defaults.
- A run in a live session.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
