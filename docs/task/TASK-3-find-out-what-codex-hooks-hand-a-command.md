---
Stable-Id: 01M7KD065CJQW9XEKA9HGMHG2X
Status: InProgress
Date: 2026-11-17
Author: beauwilliams
Kind: chore
Milestone: MILE-4
---
# 3 — Find out what Codex hooks hand a command

## Outcome

We know which features can reach Codex, which decides the command-line adapter proposed in RFC-1.

## Acceptance checks

- A list of the hook events Codex 0.167.2 raises, with what each passes to the command — evidence: code:docs/evidence/TASK-3/events.txt, code:docs/evidence/TASK-3/hook-inputs.json
- Where Codex keeps a session transcript and in what format — evidence: code:docs/evidence/TASK-3/session-file.txt
- Whether a hook can show the person a note

## Plan

- [x] Read the hook input and output schemas in the Codex binary.
- [x] Add a logging hook for each event and run a short session.
- [ ] Run an interactive session to see whether a Stop hook's `systemMessage` is shown.
- [ ] Capture a file edit, which the test environment's sandbox prevented.

## Evidence

2026-11-17, Codex 0.167.2, `codex exec` in a scratch home with a logging hook on eleven events.

- Twelve events are named in the binary's schemas. Six ran in the session: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop and SessionEnd.
- Stop carries `last_assistant_message`, `turn_id`, `session_id`, `cwd` and `transcript_path`. UserPromptSubmit carries the prompt. PreToolUse and PostToolUse carry `tool_name`, `tool_input.command` and the response.
- That is everything the stop check needs without reading the session file: the request, the commands run and their results, and the final message. The command-line adapter (MILE-5) can collect them from the hooks as they fire.
- The session file is JSON lines and holds a shell command inside a string of code, so the hooks are the easier source.
- A Stop hook's `systemMessage` did not appear in `codex exec` output. The third check stays open until an interactive session is tried.
