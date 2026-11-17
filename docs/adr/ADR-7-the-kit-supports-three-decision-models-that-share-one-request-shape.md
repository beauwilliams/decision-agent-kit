---
Stable-Id: 01M7KQYRWF3Z85QPQQ327FQMYG
Status: Accepted
Date: 2026-11-17
Author: beauwilliams
Deciders: beauwilliams
Supersedes: ADR-1
---
# 7 — The kit supports three decision models that share one request shape

## Context

ADR-1 limited the kit to SubQ, on the grounds that a second provider would double every budget, threshold and evaluation.

Three hosted decision models accept the same request, `POST /v1/systemone` with `model`, `state` and named `questions` of type `noul`, `choice` or `score`, and return `answers` and `usage.input_tokens`. Read from each provider's documentation on 2026-11-17:

| | SubQ Snap | TypeSafe Jev | Levanto Sage |
|---|---|---|---|
| Base URL | `https://api.subq.ai` | `https://api.typesafe.ai` | `https://sage.levanto.ai` |
| Pinned model | `subq-snap-1.2` | `jev-1.14.0` | `levanto-sage-2` |
| Request limit | 384K tokens | 64K tokens, 32K per question | about 32K tokens |
| Larger limit on request | none | 262K with a header | 128K with extended context |
| Error body | `detail.error_type`, `detail.message` | not read yet | `detail` as a string |

Only SubQ has been called from this repository. The Jev and Sage columns are from documentation and are not yet confirmed by a request.

The person who owns the kit wants all three supported.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| Stay with SubQ only | One set of limits and thresholds | Leaves out two models people already use, for a difference that is mostly a base URL |
| Three providers through the shared request shape | One client; a provider is a base URL, a model, a key and a size limit | Thresholds and replay evidence are per model; the smallest limit bounds what every feature may send |
| Three providers through each one's own interface | Reaches features outside the shared shape | Three clients and three answer formats for questions the kit does not ask |

## Decision

The kit supports SubQ Snap, TypeSafe Jev and Levanto Sage through the shared `/v1/systemone` request shape. A setting chooses the provider; SubQ stays the default.

A provider is data: base URL, pinned model, key source and request limit. The client stays one module with no per-provider code beyond reading each error body.

The kit uses only what all three accept: `noul`, `choice` and `score` questions over a text or JSON `state`. A feature that needs more is a new record.

Each default model is a pinned version and not a `-latest` alias, as ADR-1 decided for SubQ.

## Consequences

- A threshold belongs to a model. Evidence that allows a feature to be switched on (ADR-3) covers the model it was measured on and no other.
- A feature states the largest request it sends, and that size has to fit the smallest limit among the providers it supports, or the feature names the providers it does not support. The stop check sent 319 input tokens in live runs and fits all three. Compaction is the feature this constrains most (ADR-6).
- What leaves the machine now depends on the provider chosen. The README states each provider's retention terms as that provider documents them, or says they are not documented.
- The name `subq-agent-kit` and the folder `src/subq/` no longer describe the kit. Renaming either is a separate decision.
- RFC-1 and RFC-2 describe a SubQ-only kit and need revising before they are accepted.
- A fourth provider with the same request shape is a new row of data and a line in this record's table. A provider with a different shape needs a new record.

> **Revision log**
>
> | Date | Change | Class |
> |---|---|---|
> | 2026-11-17 | Initial record. | **structural** |
