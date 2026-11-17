---
Stable-Id: 01M7KAGW0TAMGTGJDAH3X7GPKX
Status: Accepted
Date: 2026-11-16
Author: beauwilliams
Deciders: beauwilliams
---
# 6 — The stop check ships first and compaction stays in shadow

## Context

Candidate features: context compaction, a check at the end of a turn that the work is really finished, trimming tool output as it arrives, and a risk gate on commands.

Published evaluations of decision models in agent tools report three things. Completion checks are accurate when the question carries facts about the run (was a check run and did it pass since the last edit) and near chance on wording alone. Pruning old context loses results that are needed later. Accuracy falls as the state grows toward the context window. None of these has been reproduced in this repository.

The first feature has to be useful on its own.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Compaction first | The original idea; largest token saving | The feature most likely to fail silently |
| Stop check first | Cheap, visible, easy to evaluate from recorded sessions | Saves no tokens |

## Decision

Build order:

1. Core, SubQ client, ledger and replay evaluator.
2. The stop check, fed run evidence extracted in code, advisory only.
3. Trimming tool output as it arrives.
4. The risk gate.

Compaction is built in shadow mode only. Requests keep the state small by default, in the tens of thousands of tokens, and do not fill the window.

## Consequences

- The transcript model, size estimation and redaction are shared by every feature.
- Compaction's default stays `shadow` until a record cites replay evidence for changing it.
- Trimming at arrival leaves earlier context untouched, so it does not invalidate the prompt cache the way rewriting history does.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
