---
Stable-Id: 01M7MPJ4WPDBM02HD8PKR2Y6NR
Status: Draft
Date: 2026-11-17
Version: '0.1'
Author: beauwilliams
Subject: Risk gate
---
# 3 — Risk gate

## Purpose

Put a shell command in front of the person before it runs, when it looks both hard to undo and outside what they asked for. The gate can only add a prompt. It never allows a command the harness would have asked about, and it never blocks one outright (ADR-4, EPIC-4).

It is a second look, not a security control: when the model cannot be reached in time the command runs as the harness decided, and a command written to look harmless has not been tested against it.

## Which commands are judged

A `Bash` call is judged only when all of these hold:

- The harness's own verdict is to allow it. A command it would ask about or deny is left alone: there is nothing to add.
- It is not on the read-only list: a command whose every program is one of `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `rg`, `find` without `-delete` or `-exec`, `git status`, `git diff`, `git log`, `git show`, `pwd`, `which`, `echo` with no redirect. These are never sent.
- The session is the main conversation, in a directory not listed in `disabledPaths`.

## Questions

Two yes/no questions in one request, each one judgment:

- `hard_to_undo`: would running `command` delete, overwrite or publish something that could not be restored from the project's version control? True: it removes or rewrites files or history outside what git tracks, changes a remote, a database, a deployed service or another machine, or sends something outward. False: it only reads, builds, tests, or changes tracked files a `git checkout` would restore.
- `outside_request`: does `command` act on something `user_request` did not ask for? True: its target is not named or implied by the request or the agent's stated step. False: it is a step toward what was asked.

The state holds the command, the agent's last message before the call, and the request, each redacted and cut to a fixed length.

## When a prompt is added

A prompt is added when `hard_to_undo` is at or above `undoThreshold` (start at 0.7) and `outside_request` is at or above `outsideThreshold` (start at 0.5). The prompt's reason says which of the two the model saw. Both thresholds are set from replay before `on` exists.

A missing answer, an error or a late answer adds nothing.

## Time limit

The gate waits at most 2 seconds. When the limit passes, or the request fails, the harness's verdict stands and the command runs. The ledger records that the gate was skipped and why.

## Harness support

| Harness | Event | What a hook may return | Gate |
|---|---|---|---|
| Claude Code 2.1.323 | `tool.check`: `next(e)` gives the harness's verdict | Any `{ decision }`, so `allow` can be raised to `ask` with a reason | `shadow` and `on` |
| Codex 0.167.2 | `PreToolUse` | `deny` with a reason only; `ask` and `allow` are rejected as unsupported. `PermissionRequest` fires only when Codex was already going to ask | `shadow` only |

Codex can block a command from a hook but cannot ask about one. Blocking on a model's answer is a different feature from this one and would need its own decision.

## Modes

- `off` (default): does not run and sends nothing.
- `shadow`: records what it would have asked about. In Claude Code the judging is done when the turn ends, from the transcript, so no command waits. In Codex it is done at the stop event from the collected tool events.
- `on`: Claude Code only; the command waits up to the time limit. Not available until this spec cites replay evidence (ADR-3).

## What leaves the machine

For each judged command: the command text, the agent's last message and the request, with credential-shaped text replaced. Commands on the read-only list are not sent. A command can carry a secret with no recognisable shape, such as a password typed inline; that is not caught.

## What the ledger records

One entry per judged command: the two probabilities, whether a prompt was or would have been added, the time taken, and the harness's own verdict. The command text is not stored; a hash of it is, so repeats can be counted.

## What must be measured before `on`

- **How often it would prompt**, per hundred commands, on recorded sessions. A gate that prompts often is switched off by the person and protects nothing.
- **Whether it catches what matters:** a labelled set of commands a person would have wanted to see first, and how many the gate picks.
- **Delay:** the time added to a command in `on` mode, and how often the limit is hit.

## Known gaps

- A destructive step inside a script the command runs is not seen.
- Tools other than `Bash` are not judged.
- Nothing here has been built or run.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-17 | Initial record. | **structural** |
