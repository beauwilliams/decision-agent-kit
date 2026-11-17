---
Stable-Id: 01M7MNXAQTQA2B1SQSMF2Q3YGW
Status: Draft
Date: 2026-11-17
Version: '0.2'
Author: beauwilliams
Subject: Trimming tool output
---
# 2 — Trimming tool output

## Purpose

Cut a large tool result down as it arrives, before the agent reads it, so a long session spends less of its context on output nobody needs. The full result is kept on disk and the agent is told where.

Trimming happens once, at arrival. A result that has entered the conversation is never changed afterwards: going back to cut old results is the approach other projects report as a poor fit for decision models, and it breaks the prompt cache.

## What the sessions show

Measured on the main conversation of recorded Claude Code sessions on the development machine, 2026-11-17 (subagent work is not counted):

| | Calls | Characters |
|---|---|---|
| All tool results | 905 | 1,655,869 |
| `Bash` | 688 | 1,312,436 (79%) |
| `Bash` results of 8,000 characters or more | 40 | 516,029 (31% of all tool output) |

Six in a hundred `Bash` calls hold a third of all tool output. If each were cut to 3,000 characters, tool output would fall by about a quarter. That is the most this feature can save on these sessions.

## What is trimmed

Version 1 trims the result of a `Bash` call only, and only when its output is 8,000 characters or more (`trimThreshold`).

## What is never cut

- **An error result.** A call the harness marks as failed is passed through whole.
- **Anything but `Bash`.** A file read is what the agent edits against; a subagent's report and an MCP tool's answer are already summaries.
- **The first 20 and the last 40 lines.** A command's header and its ending, where failures are reported.
- **A line that names a file with a line number, or contains `error`, `fail`, `warn`, `panic`, `exception` or `traceback`**, with the two lines either side of it.
- **A result already in the conversation.**
- **Anything, when the model cannot be reached** or answers late. The result then passes through whole.

## How a cut is decided

1. Lines the rules above keep are set aside. The rest is split into blocks of up to 40 lines.
2. One request asks one yes/no question per block: does this block hold something the agent needs for what it is doing? The state holds the request that started the turn, the command, and the agent's last message before the call. A request carries at most 24 blocks; later blocks are kept.
3. A block is cut only when its probability is at or below `cutThreshold` (default 0.2). Anything above is kept. The thresholds are set from replay before the feature can be switched on.
4. Each run of cut blocks is replaced by one line: `[decision-agent-kit cut N lines; full output: <path>]`.

A model answer here can only remove what the rules did not protect, and only when it is confident. A wrong cut costs the agent one file read; that is why the full result is always saved first.

## Fetching a cut item again

Before anything is cut, the whole result is written to `trimmed/<session>/<tool use id>.txt` in the kit's state directory, readable by the owner only. The marker line gives that path, and the agent reads it with its ordinary file tool. Files are removed when the session ends.

## Harness support

| Harness | Can it see a result | Can it change one | Trimming |
|---|---|---|---|
| Claude Code 2.1.323 | Yes: a `tool.call` hook receives the result from `next(e)` | Yes: the hook returns `{ result }` in its place, as `{ stdout, stderr }` for `Bash` | `shadow` and `on` |
| Codex 0.167.2 | Yes: the `PostToolUse` event carries the output | No: a post-tool hook can add context and can replace the output of an MCP tool only | `shadow` only |

## Modes

- `off` (default): does not run, and sends nothing.
- `shadow`: decides what it would cut and records it; the agent's result is unchanged. In Claude Code the deciding happens when the turn ends, from the transcript, so no tool call waits on the model.
- `on`: Claude Code only. The hook waits up to 3 seconds for the answer, then returns the trimmed result. Not available until this spec cites replay evidence (ADR-3).

The default is `off`, unlike the stop check, because of what it sends.

## What leaves the machine

For each trimmed result: the request, the command, the agent's last message, and up to 24 blocks of the command's output, each with credential-shaped text replaced. This is far more tool output than the stop check sends, and it can include file contents a command printed.

## What the ledger records

One entry per large result: its size, the lines the rules kept, the blocks the model would cut with their probabilities, the characters that would be saved, and the time taken. No output text.

## What must be measured before `on`

- **Saving:** characters cut, against cutting to the same size by keeping only the first and last lines with no model. If the model does not beat that, the feature is rules only.
- **Harm:** how often text from a cut block is used later in the same session: quoted in a later message, or part of a later tool call's input. Measured by replay, where nothing was really cut.
- **Delay:** the time added to a tool call in `on` mode.

## Evidence so far

Replay of 2026-11-17 over the 38 `Bash` results of 8,000 characters or more in recorded sessions, nothing really cut (`docs/evidence/TASK-7/trim-report.txt`):

| | Cut | Results trimmed | Results where cut text was used later | Names only in the cut text, used later |
|---|---|---|---|---|
| Rules, then the model at 0.2 | 103,160 characters (21% of the large results, 6% of all tool output) | 16 | 11 | 62 of 396 |
| First and last lines only, same amount kept | 102,304 characters | 16 | 11 | 79 of 440 |

- The rules alone protect 49% of the text in large results, and 7 of the 38 results entirely.
- The model does not clearly beat keeping the first and last lines. By the test this spec sets, the feature has no case for the model yet.
- Either way, two in three trimmed results lose a name the session used later. The measure overstates harm, but it is too high to switch anything on.
- The saving is small: 6% of tool output on these sessions.

Trimming therefore stays unbuilt beyond the decision function and this replay until a better question or a better measure changes these numbers.

## Open questions

- Whether trimming is worth pursuing at all, given the saving and the evidence above.

- Whether `shadow` should be the default once a person has read what it sends.
- Whether a provider with a small request limit (32,000 tokens) can take 24 blocks, or needs fewer.

## Known gaps

- Output that is one very long line is not split and is kept whole.
- Subagent conversations are not trimmed.
- The decision function and the replay exist; nothing is wired into a harness.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-17 | Initial record. | **structural** |
> | 2026-11-17 | Added the first replay evidence: the model does not beat keeping the first and last lines. | **substantive** |
