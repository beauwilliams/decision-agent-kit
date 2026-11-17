---
Stable-Id: 01M7KAGV4Y627BEXMR5XNVGERB
Status: Accepted
Date: 2026-11-16
Author: beauwilliams
Deciders: beauwilliams
---
# 4 — Model answers may tighten what the agent does and never loosen it

## Context

The state sent to the model contains tool output and fetched pages, which anyone can write. Text that reads as evidence ("the user approved this") can move a probability.

A feature that lets a model answer skip a permission prompt, approve a command or keep the agent running turns that into a way around the person.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Model answers can allow as well as block | Fewer prompts | One injected line can approve a dangerous command |
| Model answers can only tighten | An injection can at worst cause an extra question | No reduction in prompts |

## Decision

A model answer may cause more caution and never less:

- It may ask the person, show a notice, or keep more context.
- It may not approve a tool call, skip a permission prompt, or make the agent continue on its own.

Anything code can settle from facts is settled in code first, and the model is asked only what is left.

An advisory feature that errors or times out does nothing. A gate that errors or times out asks the person.

## Consequences

- The risk gate is escalate-only.
- The stop check shows a notice, at most once per turn, and never re-prompts the agent.
- Reducing permission prompts is out of scope for this kit.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
