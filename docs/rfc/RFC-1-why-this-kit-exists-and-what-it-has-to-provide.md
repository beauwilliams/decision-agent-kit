---
Stable-Id: 01M7KB25VRBAM36JJBYBD47QJE
Status: Discussion
Date: 2026-11-16
Author: beauwilliams
---
# 1 — Why this kit exists and what it has to provide

## Summary

SubQ's decision models are fast, cheap and take very long inputs, and there is almost nothing that puts them to work inside a coding agent. This repository builds that: a kit of small checks and context tools, each driven by a SubQ decision, that plugs into the coding agents we use.

## Motivation

It started with compaction. When a coding agent's context fills up, the usual answer is to have a language model summarise the old turns, and a summary loses exact paths, errors and constraints. A decision model could instead score each old tool call and keep or drop it verbatim. A plugin doing this exists for another decision model. We wanted the same on SubQ and it did not exist.

Looking further, the gap was wider than compaction. A search on 2026-11-16 found a few SubQ integrations for other agent harnesses and a handful of skills and servers, and no Claude Code plugin that uses SubQ for anything. The other decision-model ecosystem has many agent tools: completion checks, command gates, context trimming, routing.

We like SubQ for this work, for reasons we measured or read in its documentation:

- Requests up to 384K tokens and 128 questions each, where the alternative caps a request at 32K.
- About one second for a request up to 26K input tokens, measured on 2026-11-16.
- $0.04 per million input tokens and nothing for output.
- Typed answers (yes/no probability, choice, score) that code can act on with no parsing.

So the purpose is wider than one feature: make SubQ useful to coding agents, in the harnesses we work in, with features that are worth turning on.

## Proposal

**What the kit is.** One installable plugin holding several independent features. Each feature asks SubQ a narrow question about the session and does one small thing with the answer.

**What it has to provide.**

1. *A feature someone wants on day one.* The first is the stop check: at the end of a turn, say whether the agent really finished, using facts from the run before any model call (SPEC-1, ADR-6).
2. *Context tools.* Trimming tool output as it arrives, and compaction that keeps what is kept verbatim. Compaction stays in shadow mode until our own evidence supports it (ADR-3, ADR-6).
3. *A risk gate* that can only make the agent ask the person, never approve (ADR-4).
4. *Evidence before effect.* Every feature has a shadow mode, a ledger of its decisions, and a replay over recorded sessions, so a feature is turned on because of data (ADR-3).
5. *A way to see and correct it.* A command that shows what was decided in the session and lets the person label a decision good or bad.
6. *Care with what leaves the machine.* Redaction before sending, and a per-project off switch (ADR-5).

**What it is not.** It does not replace the agent's own model, generate text, or reduce permission prompts. It targets SubQ only (ADR-1).

**Which harnesses.** More than one: supporting several coding agents is a goal of the kit, not an extra. Claude Code and Codex are the first two.

The two differ in what they expose, checked on the development machine on 2026-11-16:

| Harness | Extension point | What it reaches |
|---|---|---|
| Claude Code 2.1.323 | Function-hooks plugin (early access) | End of turn, tool calls, permission checks, prompts, compaction, and notes in the interface |
| Claude Code | Command hooks | A command run on events such as the end of a turn |
| Codex 0.167.2 | Command hooks (the `hooks` feature is stable) and plugins | A command run on `SessionStart` and `Stop`; other events not yet checked |

Both harnesses can run a command when a turn ends. That makes a command-line adapter the route to more than one harness: one program that a command hook calls with the event, which reads the session and runs the same decision logic. The Claude Code function-hooks adapter stays for what only it can do, such as replacing compaction.

## Open questions

- **What each harness's command hooks carry.** Which events Codex raises beyond `SessionStart` and `Stop`, what each hands the command, where each harness keeps the session transcript, and whether a hook can show the person a note. This decides which features reach which harness.
- **Which harnesses after the first two.**
- **Does Snap judge these questions well enough?** Published evaluations disagree by task and none is ours. The replay evaluator has to answer this per feature.
- **Which features after the first four.** Candidates seen elsewhere: tracking promises the agent made, detecting loops and blind retries, enforcing constraints the person stated earlier, screening fetched pages for injection, routing by difficulty. None is committed.
- **Distribution.** A public marketplace entry, or private use first.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
> | 2026-11-16 | Several harnesses is a goal; recorded what Claude Code and Codex expose and proposed a command-line adapter. | **substantive** |
