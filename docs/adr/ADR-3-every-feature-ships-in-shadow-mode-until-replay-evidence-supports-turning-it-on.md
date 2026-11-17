---
Stable-Id: 01M7KAGTP909YPJZ505S7C9XBV
Status: Accepted
Date: 2026-11-16
Author: beauwilliams
Deciders: beauwilliams
---
# 3 — Every feature ships in shadow mode until replay evidence supports turning it on

## Context

A decision model returns a probability and no reason, so a wrong decision is silent. The agent keeps working with context it should not have lost, or is told it is finished when it is not.

Published replays of decision-model context pruning on real sessions report far more lost results than synthetic tests predicted. Those figures have not been reproduced in this repository.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Features act as soon as they are installed | Immediate value | Silent failures on real sessions |
| Features start in shadow mode | Evidence before any effect | Nothing visible changes until a feature is turned on |

## Decision

Every feature has a mode: `off`, `shadow` or `on`. The default is `shadow`: the feature computes its decisions and writes them to a ledger, and the session proceeds as if it were not installed.

A feature's default becomes `on` only when a replay evaluation over recorded sessions supports it, and the record that changes the default cites that evaluation.

## Consequences

- The ledger and the replay evaluator are built before any feature acts.
- Replay labels are a proxy: a result nobody referenced later may still have mattered. The record that turns a feature on has to say what its label measures.
- A person can still set a feature to `on` for themselves.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
