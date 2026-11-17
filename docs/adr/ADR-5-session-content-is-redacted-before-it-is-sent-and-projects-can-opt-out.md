---
Stable-Id: 01M7KAGVJ2BTNVQPD4Q15B77GM
Status: Accepted
Date: 2026-11-16
Author: beauwilliams
Deciders: beauwilliams
---
# 5 — Session content is redacted before it is sent and projects can opt out

## Context

Every feature sends session content to `api.subq.ai`. SubQ's data-retention page states that Decisions inputs and outputs are deleted within 60 days of processing, and that organizations on zero data retention store nothing.

Sessions contain credentials: tool output prints tokens, environment files and keys.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Send content as it is | Simplest; the model sees everything | Credentials leave the machine |
| Redact by pattern, with a per-project opt-out | Known credential shapes never leave; sensitive projects are excluded entirely | Patterns miss secrets with no recognisable shape |

## Decision

Every string placed in a request's state passes through `src/core/redact.ts` first. The session transcript itself is never altered by redaction.

A `disabledPaths` option lists directories; a session whose working directory is under one runs no feature.

The API key comes from the plugin's sensitive option, the `SUBQ_API_KEY` variable, or a configured command, in that order. It is never written to the repository, the ledger or a log line.

## Consequences

- A mnemonic or a bare password is not caught. The opt-out is the control for projects where that matters.
- Requesting zero data retention is an account action outside this repository.
- Redaction can hide a detail the model needed, such as a hash it was asked about.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-16 | Initial record. | **structural** |
