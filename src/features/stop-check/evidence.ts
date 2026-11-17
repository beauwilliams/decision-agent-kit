import type { Message } from '../../core/transcript.ts';

export type CheckRun = {
  command: string;
  /** `null` when the harness reports no outcome, or the exit status may not be the check's. */
  passed: boolean | null;
  afterLastEdit: boolean;
  /** The text the command printed; empty when the transcript has none. */
  output: string;
};

/** What the last turn did, read from the transcript with no model involved. */
export type RunEvidence = {
  request: string;
  toolCalls: number;
  editedFiles: string[];
  /** The shell commands counted as edits, in order. */
  shellWrites: string[];
  checks: CheckRun[];
};

export type Verdict = 'nothing_to_check' | 'verified' | 'failing_check' | 'unverified' | 'unknown';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

/** Stands in `editedFiles` for whatever shell commands changed. */
export const SHELL_EDIT = '(shell commands)';

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

const WRITE_PROGRAM = new RegExp(
  [
    String.raw`(^|[;&|(]\s*|\bxargs\s+)(sudo\s+)?(tee|mv|cp|rm|touch|truncate|patch|install|ln)\b`,
    String.raw`\b(sed|perl|ruby)\s+(-\S+\s+)*-[a-zA-Z]*i\b`,
    String.raw`\bsed\s+(-\S+\s+)*--in-place\b`,
    String.raw`\bgit\s+(apply|am|mv|rm|restore|stash\s+pop|checkout\s+(-\S+\s+)*--\s)`,
  ].join('|'),
);

const REDIRECT_TO_FILE = /(?<![0-9&>])>>?\s*(?![&>]|\/dev\/(null|stderr|stdout)\b)[^\s&|;<>]+/;

/**
 * Whether a shell command changes files. Deliberately broad: a command that
 * might write is counted as an edit, since the cost of a wrong yes is one
 * extra question and the cost of a wrong no is a change nobody checks.
 */
export function isWriteCommand(command: string): boolean {
  const unquoted = command.replace(/'[^']*'|"[^"]*"/g, '""');
  return WRITE_PROGRAM.test(command) || REDIRECT_TO_FILE.test(unquoted);
}

const HIDES_EXIT_STATUS = /\||;|\n|(?<!&)&(?!&)/;

/**
 * Whether a command's exit status can be something other than its check's:
 * a pipe reports the last program, `;` and a new line report the last command,
 * `||` swallows a failure, and `&` does not wait. `&&` alone is safe, since
 * any failure in the chain is the status.
 */
export function hidesExitStatus(command: string): boolean {
  const unquoted = command.replace(/'[^']*'|"[^"]*"/g, '""').replace(/[0-9]?>&[0-9-]/g, '');
  return HIDES_EXIT_STATUS.test(unquoted.trim());
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
 * typed. Shell commands that write count as one edit between them, since the
 * files they touched are not known.
 */
export function collectEvidence(messages: readonly Message[]): RunEvidence {
  const start = turnStart(messages);
  const results = new Map<string, { isError: boolean; text: string }>();
  for (const message of messages.slice(start)) {
    for (const result of message.toolResults ?? []) results.set(result.tool_use_id, result);
  }

  const edited = new Set<string>();
  const shellWrites: string[] = [];
  const checks: { command: string; passed: boolean | null; output: string; order: number }[] = [];
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
      if (use.tool !== 'Bash' || typeof command !== 'string') continue;
      // One command that writes and checks ("sed -i ... && make test") counts
      // as the edit followed by the check.
      if (isWriteCommand(command)) {
        edited.add(SHELL_EDIT);
        shellWrites.push(command);
        lastEdit = order;
        order += 1;
      }
      if (isCheckCommand(command)) {
        const result = results.get(use.tool_use_id);
        const isError = result?.isError ?? use.isError ?? false;
        const output = result?.text ?? use.text ?? '';
        const unknown = use.outcomeUnknown === true || hidesExitStatus(command);
        checks.push({ command, passed: unknown ? null : !isError, output, order });
      }
    }
  }

  return {
    request: messages[start]?.text ?? '',
    toolCalls,
    editedFiles: [...edited],
    shellWrites,
    checks: checks.map(({ command, passed, output, order: at }) => ({
      command,
      passed,
      output,
      afterLastEdit: at > lastEdit,
    })),
  };
}

/**
 * What the evidence settles by itself. The newest check run after the last
 * edit decides; edits with no check after them are `unverified`, and a check
 * with no reported outcome leaves the verdict `unknown`.
 */
export function ruleVerdict(evidence: RunEvidence): Verdict {
  if (evidence.editedFiles.length === 0) return 'nothing_to_check';
  const after = evidence.checks.filter((check) => check.afterLastEdit);
  const newest = after[after.length - 1];
  if (!newest) return 'unverified';
  if (newest.passed === null) return 'unknown';
  return newest.passed ? 'verified' : 'failing_check';
}
