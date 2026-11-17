---
Stable-Id: 01M7KD05N4PTV51TWM2BYNPVKH
Status: Done
Date: 2026-11-17
Author: beauwilliams
Kind: feature
Milestone: MILE-2
Depends-on: TASK-1
---
# 2 — Set the stop check thresholds from replayed sessions

## Outcome

The two thresholds are chosen from data, and the record that turns the stop check on can cite it (ADR-3).

## Acceptance checks

- A command replays recorded sessions through the stop check and writes one row per turn with the rule verdict and probabilities — evidence: test:tests/replay.test.ts
- The report says how often each finding fired at each threshold — evidence: code:docs/evidence/TASK-2/replay-report.txt
- The thresholds in the spec are replaced by ones the report supports, or kept with the numbers that support them — evidence: spec:docs/spec/SPEC-1-stop-check.md

## Plan

- [x] Parse Claude Code session files into the transcript model.
- [x] Replay each turn through the stop check.
- [x] Label a sample of flagged and unflagged turns (by a model; see Evidence).

## Evidence

Run on 2026-11-17 on branch `replay-evaluator`, model `subq-snap-1.2`.

- `make replay ARGS=--ask` read 29 session files from 13 projects, found 154 finished turns and wrote one row per turn to `eval/out/replay.jsonl` (kept out of the repository: the rows hold session text).
- 59 turns were sent to SubQ for 50,078 input tokens. The rest were settled with no request.
- The report gives, for each finding and each threshold from 0.5 to 0.9, how many turns it flags, with false alarms and misses against the labels. The numbers are in SPEC-1.
- Two identical runs returned identical probabilities on all 58 shared turns.
- SPEC-1 was revised: both thresholds stay at 0.7, with the numbers.

The third plan step was not done by hand. A model that did not see the probabilities labelled the 58 turns and marked 15 unsure; TASK-16 has a person check them.

Found on the way: TASK-15 (shell edits are not counted) and TASK-17 (the unfinished question).
