import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { inputJson, type Message } from '../src/core/transcript.ts';
import { createAsker, type Fetch } from '../src/decision/client.ts';
import { resolveProvider } from '../src/decision/providers.ts';
import {
  DEFAULT_TRIM_OPTIONS,
  decideTrim,
  planTrim,
  type TrimDecision,
} from '../src/features/trim/trim.ts';
import { parseSession } from './sessions.ts';
import { baselineCut, harm, keptChars, lineSet } from './trim-measure.ts';

type Sample = {
  id: string;
  request: string;
  command: string;
  intent: string;
  output: string;
  later: string;
};

type Row = {
  id: string;
  totalChars: number;
  lines: number;
  blocks: number;
  asked: number;
  cutBlocks: number;
  cutChars: number;
  protectedChars: number;
  probabilities: (number | null)[] | null;
  /** Characters per asked block, in block order, so other thresholds can be recomputed. */
  blockChars: number[];
  inputTokens: number;
  modelUsedLater: boolean;
  modelTokens: number;
  modelUsedTokens: number;
  baselineCutChars: number;
  baselineUsedLater: boolean;
  baselineTokens: number;
  baselineUsedTokens: number;
};

const OPTIONS = DEFAULT_TRIM_OPTIONS;
const THRESHOLDS = [0.1, 0.2, 0.3, 0.5];

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function isPrompt(message: Message): boolean {
  return message.role === 'user' && message.text.trim() !== '' && !message.toolResults?.length;
}

function holdsResult(message: Message, id: string): boolean {
  return (message.toolResults ?? []).some((result) => result.tool_use_id === id);
}

function laterText(messages: readonly Message[], id: string): string | undefined {
  const at = messages.findIndex((message) => holdsResult(message, id));
  if (at === -1) return undefined;
  const parts: string[] = [];
  for (const message of messages.slice(at + 1)) {
    if (message.role !== 'assistant') continue;
    if (message.text.trim() !== '') parts.push(message.text);
    for (const use of message.toolUses) parts.push(inputJson(use.input));
  }
  return parts.join('\n');
}

/** Every large, successful Bash result, once each. */
function samples(root: string): Sample[] {
  const seen = new Map<string, Sample>();
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const entry of readdirSync(join(root, project.name), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const turns = parseSession(readFileSync(join(root, project.name, entry.name), 'utf8'));
      const last = turns.at(-1);
      for (const turn of turns) {
        const results = new Map<string, { text: string; isError: boolean }>();
        for (const message of turn.messages) {
          for (const result of message.toolResults ?? []) results.set(result.tool_use_id, result);
        }
        turn.messages.forEach((message, at) => {
          for (const use of message.toolUses) {
            const command = use.input.command;
            const result = results.get(use.tool_use_id);
            if (use.tool !== 'Bash' || typeof command !== 'string' || !result) continue;
            if (result.isError || result.text.length < OPTIONS.trimThreshold) continue;
            if (seen.has(use.tool_use_id)) continue;
            let start = at;
            while (start > 0 && !isPrompt(turn.messages[start] as Message)) start--;
            let intent = '';
            for (let i = at; i > start; i--) {
              const earlier = turn.messages[i] as Message;
              if (earlier.role === 'assistant' && earlier.text.trim() !== '') {
                intent = earlier.text;
                break;
              }
            }
            const later =
              (last && laterText(last.messages, use.tool_use_id)) ??
              laterText(turn.messages, use.tool_use_id) ??
              '';
            seen.set(use.tool_use_id, {
              id: use.tool_use_id,
              request: (turn.messages[start] as Message).text,
              command,
              intent,
              output: result.text,
              later,
            });
          }
        });
      }
    }
  }
  return [...seen.values()];
}

async function measure(
  sample: Sample,
  ask: ReturnType<typeof createAsker> | undefined,
): Promise<Row> {
  const lines = sample.output.split('\n');
  const plan = planTrim(sample.output, OPTIONS);
  let protectedChars = 0;
  lines.forEach((line, i) => {
    if (!plan || plan.protectedLines[i]) protectedChars += line.length + 1;
  });
  const row: Row = {
    id: sample.id,
    totalChars: sample.output.length,
    lines: lines.length,
    blocks: plan?.blocks.length ?? 0,
    asked: 0,
    cutBlocks: 0,
    cutChars: 0,
    protectedChars,
    probabilities: null,
    blockChars: (plan?.blocks ?? [])
      .slice(0, OPTIONS.maxBlocks)
      .map((block) =>
        lines.slice(block.start, block.end).reduce((sum, line) => sum + line.length + 1, 0),
      ),
    inputTokens: 0,
    modelUsedLater: false,
    modelTokens: 0,
    modelUsedTokens: 0,
    baselineCutChars: 0,
    baselineUsedLater: false,
    baselineTokens: 0,
    baselineUsedTokens: 0,
  };
  if (!ask || !plan) return row;

  let decision: TrimDecision | undefined;
  let probabilities: (number | null)[] | null = null;
  try {
    const context = { request: sample.request, command: sample.command, intent: sample.intent };
    let captured: Record<string, { noul?: number }> = {};
    decision = await decideTrim(
      sample.output,
      context,
      async (state, questions) => {
        const answered = await ask(state, questions);
        captured = answered.answers;
        return answered;
      },
      OPTIONS,
    );
    probabilities = row.blockChars.map((_, n) => {
      const value = captured[`b${n}`]?.noul;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    });
  } catch {
    decision = undefined;
    probabilities = null;
  }
  row.asked = decision?.asked ?? 0;
  row.probabilities = probabilities;
  if (!decision) return row;
  row.inputTokens = decision.inputTokens;
  row.cutBlocks = decision.cut.length;
  row.cutChars = decision.cutChars;

  const modelCut = lineSet(decision.cut);
  const modelHarm = harm(lines, modelCut, sample.command, sample.request, sample.later);
  row.modelTokens = modelHarm.tokens;
  row.modelUsedTokens = modelHarm.used;
  row.modelUsedLater = modelHarm.usedLater;

  if (decision.cut.length > 0) {
    const block = baselineCut(
      lines,
      keptChars(lines, modelCut),
      OPTIONS.headLines,
      OPTIONS.tailLines,
    );
    if (block) {
      const baseline = lineSet([block]);
      row.baselineCutChars = sample.output.length - keptChars(lines, baseline);
      const baselineHarm = harm(lines, baseline, sample.command, sample.request, sample.later);
      row.baselineTokens = baselineHarm.tokens;
      row.baselineUsedTokens = baselineHarm.used;
      row.baselineUsedLater = baselineHarm.usedLater;
    }
  }
  return row;
}

function cutAt(row: Row, threshold: number): { blocks: number; chars: number } {
  let blocks = 0;
  let chars = 0;
  row.probabilities?.forEach((p, n) => {
    if (p !== null && Number.isFinite(p) && p <= threshold) {
      blocks++;
      chars += row.blockChars[n] ?? 0;
    }
  });
  return { blocks, chars };
}

function pct(part: number, whole: number): string {
  return whole === 0 ? '0.0%' : `${((100 * part) / whole).toFixed(1)}%`;
}

function report(rows: readonly Row[]): string {
  const total = rows.reduce((sum, row) => sum + row.totalChars, 0);
  const protectedChars = rows.reduce((sum, row) => sum + row.protectedChars, 0);
  const scored = rows.filter((row) => row.probabilities !== null);
  const lines = [
    `${rows.length} large Bash results; ${scored.length} scored by the model`,
    `  total chars: ${total}`,
    `  chars the rules protect: ${protectedChars} (${pct(protectedChars, total)})`,
    `  total input tokens: ${rows.reduce((sum, row) => sum + row.inputTokens, 0)}`,
  ];
  for (const threshold of THRESHOLDS) {
    const cuts = rows.map((row) => cutAt(row, threshold));
    const chars = cuts.reduce((sum, cut) => sum + cut.chars, 0);
    const marker = threshold === OPTIONS.cutThreshold ? ' (default)' : '';
    lines.push(
      `  model at cutThreshold ${threshold}${marker}:`,
      `    blocks cut: ${cuts.reduce((sum, cut) => sum + cut.blocks, 0)}`,
      `    chars cut: ${chars} (${pct(chars, total)} of total)`,
      `    samples with any cut: ${cuts.filter((cut) => cut.blocks > 0).length}`,
    );
    if (threshold === OPTIONS.cutThreshold) {
      lines.push(
        `    samples where cut text was used later: ${rows.filter((row) => row.modelUsedLater).length}`,
        `    names only in the cut text: ${rows.reduce((sum, row) => sum + row.modelTokens, 0)}, of which used later: ${rows.reduce((sum, row) => sum + row.modelUsedTokens, 0)}`,
      );
    } else {
      lines.push('    used-later is measured at the default threshold only (needs the text)');
    }
  }
  const baseChars = rows.reduce((sum, row) => sum + row.baselineCutChars, 0);
  lines.push(
    `  baseline (head and tail only, same chars kept as the model at ${OPTIONS.cutThreshold}):`,
    `    chars cut: ${baseChars} (${pct(baseChars, total)} of total)`,
    `    samples with any cut: ${rows.filter((row) => row.baselineCutChars > 0).length}`,
    `    samples where cut text was used later: ${rows.filter((row) => row.baselineUsedLater).length}`,
    `    names only in the cut text: ${rows.reduce((sum, row) => sum + row.baselineTokens, 0)}, of which used later: ${rows.reduce((sum, row) => sum + row.baselineUsedTokens, 0)}`,
  );
  return lines.join('\n');
}

const nodeFetch: Fetch = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status, ok: response.ok, text: await response.text() };
};

async function main(): Promise<void> {
  const out = option('out') ?? join('eval', 'out');
  const path = join(out, 'trim.jsonl');
  mkdirSync(out, { recursive: true });
  let rows: Row[];
  if (process.argv.includes('--report')) {
    rows = readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Row);
  } else {
    const all = samples(option('sessions') ?? join(homedir(), '.claude', 'projects'));
    const send = process.argv.includes('--ask');
    const provider = resolveProvider(option('provider'));
    const apiKey = process.env[provider.keyVariable] ?? '';
    if (send && apiKey === '') throw new Error(`--ask needs ${provider.keyVariable}`);
    const ask = send
      ? createAsker({
          apiKey,
          fetch: nodeFetch,
          sleep,
          url: provider.url,
          model: provider.model,
        })
      : undefined;
    rows = [];
    const size = 6;
    for (let at = 0; at < all.length; at += size) {
      rows.push(...(await Promise.all(all.slice(at, at + size).map((s) => measure(s, ask)))));
    }
    writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  }
  const summary = report(rows);
  writeFileSync(join(out, 'trim-report.txt'), `${summary}\n`);
  console.log(summary);
}

await main();
