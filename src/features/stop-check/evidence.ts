import type { Message } from '../../core/transcript.ts';

export type CheckRun = {
  command: string;
  passed: boolean;
  afterLastEdit: boolean;
};

/** What the last turn did, read from the transcript with no model involved. */
export type RunEvidence = {
  request: string;
  toolCalls: number;
  editedFiles: string[];
  checks: CheckRun[];
};

export type Verdict = 'nothing_to_check' | 'verified' | 'failing_check' | 'unverified';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

const CHECK_COMMAND = new RegExp(
  [
    String.raw`\b(vitest|jest|pytest|mocha|playwright|tsc|eslint|ruff|mypy|nextest)\b`,
    String.raw`\b(npm|pnpm|yarn|bun|deno)\s+(run\s+)?(test|build|lint|check|type-?check|ci)\b`,
    String.raw`\b(cargo|go|dotnet|mvn|gradle|forge|swift|zig)\s+(test|build|check|vet|clippy)\b`,
    String.raw`\b(make|just)\s+(ci|test|check|lint|build)\b`,
    String.raw`\bnode\s+--test\b`,
  ].join('|'),
);

export function isCheckCommand(command: string): boolean {
  return CHECK_COMMAND.test(command);
}

function turnStart(messages: readonly Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === 'user' && message.text.trim() !== '' && !message.toolResults?.length) {
      return i;
    }
  }
  return 0;
}

/**
 * Evidence from the last turn: everything after the newest prompt the person
 * typed. A file changed by a shell command is not seen as an edit.
 */
export function collectEvidence(messages: readonly Message[]): RunEvidence {
  const start = turnStart(messages);
  const errors = new Map<string, boolean>();
  for (const message of messages.slice(start)) {
    for (const result of message.toolResults ?? []) errors.set(result.tool_use_id, result.isError);
  }

  const edited = new Set<string>();
  const checks: { command: string; passed: boolean; order: number }[] = [];
  let order = 0;
  let lastEdit = -1;
  let toolCalls = 0;
  for (const message of messages.slice(start)) {
    for (const use of message.toolUses) {
      order += 1;
      toolCalls += 1;
      if (EDIT_TOOLS.has(use.tool)) {
        const path = use.input.file_path ?? use.input.notebook_path;
        edited.add(typeof path === 'string' ? path : '(unknown)');
        lastEdit = order;
        continue;
      }
      const command = use.input.command;
      if (use.tool === 'Bash' && typeof command === 'string' && isCheckCommand(command)) {
        const isError = errors.get(use.tool_use_id) ?? use.isError ?? false;
        checks.push({ command, passed: !isError, order });
      }
    }
  }

  return {
    request: messages[start]?.text ?? '',
    toolCalls,
    editedFiles: [...edited],
    checks: checks.map(({ command, passed, order: at }) => ({
      command,
      passed,
      afterLastEdit: at > lastEdit,
    })),
  };
}

/**
 * What the evidence settles by itself. The newest check run after the last
 * edit decides; edits with no check after them are `unverified`.
 */
export function ruleVerdict(evidence: RunEvidence): Verdict {
  if (evidence.editedFiles.length === 0) return 'nothing_to_check';
  const after = evidence.checks.filter((check) => check.afterLastEdit);
  const newest = after[after.length - 1];
  if (!newest) return 'unverified';
  return newest.passed ? 'verified' : 'failing_check';
}
