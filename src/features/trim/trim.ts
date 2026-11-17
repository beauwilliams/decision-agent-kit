import { createRedactor } from '../../core/redact.ts';
import { abridge } from '../../core/transcript.ts';
import type { Asker, Question } from '../../decision/client.ts';

export type TrimOptions = {
  /** Output shorter than this many characters is not trimmed. */
  trimThreshold: number;
  headLines: number;
  tailLines: number;
  /** Lines kept on either side of a line the rules protect. */
  contextLines: number;
  /** Most lines in one block. */
  blockLines: number;
  /** Blocks beyond this many are kept and not asked about. */
  maxBlocks: number;
  /** A block's text is abridged to this many characters before it is sent. */
  blockChars: number;
  /** A block is cut only when its probability is at or below this. */
  cutThreshold: number;
};

export const DEFAULT_TRIM_OPTIONS: TrimOptions = {
  trimThreshold: 8000,
  headLines: 20,
  tailLines: 40,
  contextLines: 2,
  blockLines: 40,
  maxBlocks: 24,
  blockChars: 2000,
  cutThreshold: 0.2,
};

export type TrimContext = { request: string; command: string; intent: string };

/** Line indexes, end exclusive. */
export type Block = { start: number; end: number };

export type TrimPlan = { lines: string[]; protectedLines: boolean[]; blocks: Block[] };

export type TrimDecision = {
  totalChars: number;
  blocks: number;
  asked: number;
  cut: { start: number; end: number; probability: number }[];
  /** Characters removed, each cut line counted with its newline, before markers are added. */
  cutChars: number;
  inputTokens: number;
  redactions: number;
};

const MIN_RUN = 3;
const COMMAND_CHARS = 400;
const INTENT_CHARS = 1500;
const REQUEST_CHARS = 1500;

const FILE_LINE = /[\w./\\-]+\.[A-Za-z][A-Za-z0-9]{0,4}(?::\d+|\(\d+(?:,\s*\d+)?\))/;
const TROUBLE = /error|fail|warn|panic|exception|traceback/i;

function blockQuestion(id: string): Question {
  return {
    type: 'noul',
    instructions: `Does \`blocks.${id}\` hold information the agent needs to act on \`user_request\` or to carry out \`agent_intent\`?`,
    criteria: {
      true: 'It contains a result, value, name, error or instruction the agent would use or report',
      false:
        'It is progress output, repeated lines, download or build noise, or detail unrelated to the request',
    },
  };
}

/** The lines the rules keep, and the blocks the model is asked about. */
export function planTrim(
  output: string,
  options: TrimOptions = DEFAULT_TRIM_OPTIONS,
): TrimPlan | undefined {
  if (output.length < options.trimThreshold) return undefined;
  const lines = output.split('\n');
  const keep = new Array<boolean>(lines.length).fill(false);
  const mark = (from: number, to: number): void => {
    for (let i = Math.max(0, from); i < Math.min(lines.length, to); i++) keep[i] = true;
  };
  mark(0, options.headLines);
  mark(lines.length - options.tailLines, lines.length);
  lines.forEach((line, i) => {
    if (FILE_LINE.test(line) || TROUBLE.test(line)) {
      mark(i - options.contextLines, i + options.contextLines + 1);
    }
  });

  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (keep[i]) {
      i++;
      continue;
    }
    let end = i;
    while (end < lines.length && !keep[end]) end++;
    if (end - i < MIN_RUN) {
      mark(i, end);
    } else {
      for (let start = i; start < end; start += options.blockLines) {
        blocks.push({ start, end: Math.min(end, start + options.blockLines) });
      }
    }
    i = end;
  }
  return blocks.length === 0 ? undefined : { lines, protectedLines: keep, blocks };
}

/**
 * Asks one question per block, up to `maxBlocks`, and picks the blocks whose
 * answer is a confident no. A missing or non-finite answer keeps the block. A
 * failed request throws, and the caller cuts nothing.
 */
export async function decideTrim(
  output: string,
  context: TrimContext,
  ask: Asker,
  options: TrimOptions = DEFAULT_TRIM_OPTIONS,
): Promise<TrimDecision | undefined> {
  const plan = planTrim(output, options);
  if (!plan) return undefined;
  const redact = createRedactor();
  const asked = plan.blocks.slice(0, options.maxBlocks);
  const texts: Record<string, string> = {};
  const questions: Record<string, Question> = {};
  asked.forEach((block, n) => {
    const id = `b${n}`;
    const text = plan.lines.slice(block.start, block.end).join('\n');
    texts[id] = redact(abridge(text, options.blockChars));
    questions[id] = blockQuestion(id);
  });
  const state = {
    blocks: texts,
    command: redact(abridge(context.command, COMMAND_CHARS)),
    agent_intent: redact(abridge(context.intent, INTENT_CHARS)),
    user_request: redact(abridge(context.request, REQUEST_CHARS)),
  };
  const answered = await ask(state, questions);

  const cut: TrimDecision['cut'] = [];
  let cutChars = 0;
  asked.forEach((block, n) => {
    const value = answered.answers[`b${n}`]?.noul;
    if (typeof value !== 'number' || !Number.isFinite(value) || value > options.cutThreshold) {
      return;
    }
    cut.push({ start: block.start, end: block.end, probability: value });
    for (let i = block.start; i < block.end; i++) cutChars += (plan.lines[i] as string).length + 1;
  });
  return {
    totalChars: output.length,
    blocks: plan.blocks.length,
    asked: asked.length,
    cut,
    cutChars,
    inputTokens: answered.inputTokens,
    redactions: redact.count,
  };
}

/** The output with each run of adjacent cut blocks replaced by one marker line. */
export function applyTrim(output: string, cut: readonly Block[], fullOutputPath: string): string {
  if (cut.length === 0) return output;
  const lines = output.split('\n');
  const sorted = [...cut].sort((a, b) => a.start - b.start);
  const result: string[] = [];
  let at = 0;
  let i = 0;
  while (i < sorted.length) {
    const start = (sorted[i] as Block).start;
    let end = (sorted[i] as Block).end;
    while (i + 1 < sorted.length && (sorted[i + 1] as Block).start === end) {
      end = (sorted[i + 1] as Block).end;
      i++;
    }
    result.push(...lines.slice(at, start));
    result.push(`[decision-agent-kit cut ${end - start} lines; full output: ${fullOutputPath}]`);
    at = end;
    i++;
  }
  result.push(...lines.slice(at));
  return result.join('\n');
}
