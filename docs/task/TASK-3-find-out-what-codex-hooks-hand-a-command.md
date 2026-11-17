---
Stable-Id: 01M7KD065CJQW9XEKA9HGMHG2X
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: chore
---
# 3 — Find out what Codex hooks hand a command

## Outcome

We know which features can reach Codex, which decides the command-line adapter proposed in RFC-1.

## Acceptance checks

- A list of the hook events Codex 0.167.2 raises, with what each passes to the command. Evidence: the hook input captured from a real session.
- Where Codex keeps a session transcript and in what format. Evidence: a file path and a sample.
- Whether a hook can show the person a note. Evidence: a test hook's visible effect.

## Plan

- [ ] Read the Codex hooks documentation.
- [ ] Add a logging hook for each event and run a short session.

## Evidence

None yet.
