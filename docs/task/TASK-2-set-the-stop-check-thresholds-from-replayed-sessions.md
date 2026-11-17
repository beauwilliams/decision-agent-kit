---
Stable-Id: 01M7KD05N4PTV51TWM2BYNPVKH
Status: Open
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Depends-on: TASK-1
---
# 2 — Set the stop check thresholds from replayed sessions

## Outcome

The two thresholds are chosen from data, and the record that turns the stop check on can cite it (ADR-3).

## Acceptance checks

- A command replays recorded sessions through the stop check and writes one row per turn with the rule verdict and probabilities. Evidence: its output file.
- The report says how often each finding fired and on which turns. Evidence: the report.
- The thresholds in the spec are replaced by ones the report supports, or kept with the numbers that support them. Evidence: a revision of SPEC-1.

## Plan

- [ ] Parse Claude Code session files into the transcript model.
- [ ] Replay each turn through the stop check.
- [ ] Label a sample of flagged and unflagged turns by hand.

## Evidence

None yet.
