---
Stable-Id: 01M7KAGSPWTK5TWPAXPV24CAJX
Status: Superseded
Date: 2026-11-16
Author: beauwilliams
Deciders: beauwilliams
---
# 1 — SubQ is the only decision model the kit targets

## Context

The kit asks a decision model typed questions about an agent session and acts on the probabilities. SubQ Snap's Decisions API (`POST /v1/systemone`) accepts requests up to 384K tokens and 1-128 questions, and bills input tokens only.

Measured from the development machine on 2026-11-16 against `subq-snap-1.2`: about 1 s for requests up to 26K input tokens, 3.3 s at 224K, and a `400` "Input exceeds the token limit" above the window. A character-count guess of that 224K request was 150K, so sizes cannot be assumed from text length.

Another provider serves the same wire shape with a 32K request cap.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| SubQ only | One contract, one set of limits, one model to tune thresholds against | Tied to one vendor's preview model |
| SubQ and a second provider behind a profile | A fallback when one is down | Every budget, threshold and evaluation doubles; the smaller cap forces a separate state-shrinking path |

## Decision

The kit targets SubQ only. `src/subq/client.ts` speaks the Decisions API directly, with no provider abstraction.

The default model is the versioned ID `subq-snap-1.2`, not the `-latest` alias, because thresholds are tuned against one model version.

## Consequences

- Budgets and batching assume Snap's limits (128 questions per request, the 384K window).
- When a pinned model is retired, the default changes only after the replay evaluation has been re-run on the replacement.
- Supporting another provider later needs a new record that supersedes this one.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
> | 2026-11-17 | Superseded by ADR-7, which adds two providers. | **structural** |
