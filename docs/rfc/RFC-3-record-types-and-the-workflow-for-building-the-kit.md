---
Stable-Id: 01M7KB26QQFB6ZAGED6RXPPPFB
Status: Discussion
Date: 2026-11-16
Author: beauwilliams
---
# 3 — Record types and the workflow for building the kit

## Summary

Which kinds of record this repository keeps, how they relate, and the path a piece of work takes from idea to shipped. Records are managed with urzua.

## Motivation

Work here is done mostly by agents, across sessions that do not share memory. Without written records the reasons for a choice are lost between sessions and the same question is reopened. We also want a visible order of work: what is next, what it depends on, what is done.

urzua is a configurable record engine, so the record model is ours to choose and does not have to copy any other repository's.

## Proposal

**Record types.**

| Type | Prefix | What it records | State |
|---|---|---|---|
| Decision | ADR | A choice already made, with the options it beat | Configured |
| Proposal | RFC | A direction still open for comment | Configured |
| Specification | SPEC | What one feature does, precisely enough to test | Configured |
| Task | TASK | One outcome someone asked for, of any kind | Configured |
| Milestone | MILE | A group of tasks that together make something usable | Configured |
| Epic | EPIC | A group of milestones with one larger goal | Configured |

**One task type.** A task covers every kind of work: a feature, a bug, a chore. Its `Kind` field says which. Tasks go into milestones through a `Milestone` field, and milestones go into epics through an `Epic` field. Bugs are tasks and can belong to a milestone like any other.

**What a task holds.** A task is named after its outcome and has four sections:

- *Outcome:* what a person can do or see once it is done.
- *Acceptance checks:* statements that must be true, each with the kind of evidence that will show it. Written before any code.
- *Plan:* a checklist. A step found along the way is added before it is started, so the open steps are always what is left.
- *Evidence:* what was run, the result, and the commit it ran against. A result with no commit proves nothing about the current code.

A task should be small enough to review in one sitting.

**Workflow.**

1. An open question becomes an RFC.
2. When it is settled, the decision is an ADR.
3. A feature gets a SPEC before code.
4. Work is filed as tasks, grouped into milestones and epics. A task names what it depends on, and the order of work is computed from that.
5. A task is done when its acceptance checks have passing evidence at the current code, and a person has looked at it.

**Notes before blocks.** A gap in a record is reported and work continues. Only a decision that belongs to a person, such as accepting an ADR, stops anything.

**What is not checked yet.** On urzua 0.4.6 nothing stops `Kind` holding any text, or `Milestone` naming a record that is not a milestone. Both constraints are being added to urzua and will be declared here when released.

## Open questions

- **Should `Kind: bug` require more?** A reproduction, a severity. Possible once urzua can key a requirement on a field.
- **Should an epic's and a milestone's status be derived from its children?** Written by hand today.
- **Should RFCs and ADRs name each other in a checked field?** "Derives from" is prose today.
- **Where evidence lives.** In the task's own section today. urzua can pin a file as evidence and report when it drifts; whether tasks should use that is undecided.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
> | 2026-11-17 | One task type with a Kind, grouped into milestones and epics; tasks carry an outcome, acceptance checks, a plan and evidence. | **substantive** |
