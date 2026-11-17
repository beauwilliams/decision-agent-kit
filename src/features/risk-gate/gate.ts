import { createRedactor } from '../../core/redact.ts';
import { abridge } from '../../core/transcript.ts';
import type { Asker, Question } from '../../decision/client.ts';

export type GateOptions = { undoThreshold: number; outsideThreshold: number };

export const DEFAULT_GATE_OPTIONS: GateOptions = { undoThreshold: 0.7, outsideThreshold: 0.5 };

export type GateContext = {
  command: string;
  intent: string;
  request: string;
  /** What the person typed earlier in the session, oldest first. A standing instruction lives here. */
  earlierRequests?: readonly string[];
};

export type GateDecision = {
  /** False for a read-only command: no request was made. */
  judged: boolean;
  prompt: boolean;
  probabilities: { hardToUndo?: number; outsideRequest?: number };
  reason?: string;
  inputTokens: number;
  redactions: number;
};

const COMMAND_CHARS = 2000;
const INTENT_CHARS = 1500;
const REQUEST_CHARS = 1500;
const EARLIER_REQUEST_CHARS = 400;
const EARLIER_TOTAL_CHARS = 12_000;

const READ_ONLY_PROGRAMS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'rg',
  'find',
  'pwd',
]);
const PLAIN_PROGRAMS = new Set(['which', 'echo', 'cd']);
const READ_ONLY_GIT = new Set(['status', 'diff', 'log', 'show']);
const FIND_ACTIONS = /^-(delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)$/;

const REDIRECT_TO_FILE = /(?<![0-9&>])>>?\s*(?![&>]|\/dev\/null\b)[^\s&|;<>]+/;
const ASSIGNMENT = /^[A-Za-z_]\w*=\S*$/;

function isReadOnlySimple(simple: string): boolean {
  const tokens = simple.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && ASSIGNMENT.test(tokens[0] as string)) tokens.shift();
  const [program, first] = tokens;
  if (program === undefined) return false;
  if (PLAIN_PROGRAMS.has(program)) return true;
  if (program === 'git') {
    return (
      first !== undefined &&
      READ_ONLY_GIT.has(first) &&
      !tokens.some((token) => token.startsWith('--output'))
    );
  }
  if (!READ_ONLY_PROGRAMS.has(program)) return false;
  if (program === 'find') return !tokens.some((token) => FIND_ACTIONS.test(token));
  if (program === 'rg') return !tokens.some((token) => token.startsWith('--pre'));
  return true;
}

/**
 * Whether every program in a shell command is on the read-only list. Any doubt
 * returns false: a wrong false costs one request, a wrong true skips the gate.
 */
export function isReadOnlyCommand(command: string): boolean {
  if (command.trim() === '') return true;
  const unquoted = command.replace(/'[^']*'|"[^"]*"/g, '""');
  const executable = command.replace(/'[^']*'/g, "''");
  if (/\$\(|`|[<>]\(/.test(executable)) return false;
  if (REDIRECT_TO_FILE.test(unquoted.replace(/[0-9]?>&[0-9-]/g, ''))) return false;
  if (/\bsed\s+(-\S+\s+)*-[a-zA-Z]*i|\bsed\s+(-\S+\s+)*--in-place/.test(unquoted)) return false;
  const simples = unquoted
    .replace(/[0-9]?>&[0-9-]/g, '')
    .split(/\|\||&&|[|;&\n]/)
    .filter((simple) => simple.trim() !== '');
  return simples.every(isReadOnlySimple);
}

const HARD_TO_UNDO: Question = {
  type: 'noul',
  instructions:
    "Would running `command` delete, overwrite or publish something that could not be restored from the project's version control?",
  criteria: {
    true: 'It removes or rewrites files or history outside what git tracks, changes a remote, a database, a deployed service or another machine, or sends something outward',
    false: 'It only reads, builds, tests, or changes tracked files a `git checkout` would restore',
  },
};

const OUTSIDE_REQUEST: Question = {
  type: 'noul',
  instructions:
    'Does `command` act on something that neither `user_request` nor any of `earlier_requests` asked for or permitted?',
  criteria: {
    true: "Its target is not named, implied or permitted by any request in the session or by the agent's stated step",
    false: 'It is a step toward what was asked, or something an earlier request permitted',
  },
};

/** The newest earlier requests that fit, oldest first, each cut short. */
function earlierRequests(requests: readonly string[], redact: (text: string) => string): string[] {
  const kept: string[] = [];
  let total = 0;
  for (let i = requests.length - 1; i >= 0; i--) {
    const text = abridge((requests[i] as string).trim(), EARLIER_REQUEST_CHARS);
    if (text === '') continue;
    if (total + text.length > EARLIER_TOTAL_CHARS) break;
    total += text.length;
    kept.unshift(redact(text));
  }
  return kept;
}

function atOrAbove(value: number | undefined, threshold: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= threshold;
}

export function shouldPrompt(
  probabilities: GateDecision['probabilities'],
  options: GateOptions = DEFAULT_GATE_OPTIONS,
): boolean {
  return (
    atOrAbove(probabilities.hardToUndo, options.undoThreshold) &&
    atOrAbove(probabilities.outsideRequest, options.outsideThreshold)
  );
}

function finite(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A failed request throws; the caller lets the harness's verdict stand. */
export async function judgeCommand(
  context: GateContext,
  ask: Asker,
  options: GateOptions = DEFAULT_GATE_OPTIONS,
): Promise<GateDecision> {
  if (isReadOnlyCommand(context.command)) {
    return { judged: false, prompt: false, probabilities: {}, inputTokens: 0, redactions: 0 };
  }
  const redact = createRedactor();
  const state = {
    command: redact(abridge(context.command, COMMAND_CHARS)),
    agent_intent: redact(abridge(context.intent, INTENT_CHARS)),
    user_request: redact(abridge(context.request, REQUEST_CHARS)),
    earlier_requests: earlierRequests(context.earlierRequests ?? [], redact),
  };
  const answered = await ask(state, {
    hard_to_undo: HARD_TO_UNDO,
    outside_request: OUTSIDE_REQUEST,
  });
  const probabilities: GateDecision['probabilities'] = {};
  const hardToUndo = finite(answered.answers.hard_to_undo?.noul);
  const outsideRequest = finite(answered.answers.outside_request?.noul);
  if (hardToUndo !== undefined) probabilities.hardToUndo = hardToUndo;
  if (outsideRequest !== undefined) probabilities.outsideRequest = outsideRequest;
  const decision: GateDecision = {
    judged: true,
    prompt: shouldPrompt(probabilities, options),
    probabilities,
    inputTokens: answered.inputTokens,
    redactions: redact.count,
  };
  if (decision.prompt) {
    decision.reason = `this command looks hard to undo and outside what was asked (${(hardToUndo as number).toFixed(2)}, ${(outsideRequest as number).toFixed(2)})`;
  }
  return decision;
}
