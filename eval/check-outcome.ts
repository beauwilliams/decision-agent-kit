import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { createRedactor } from '../src/core/redact.ts';
import { createAsker, type Fetch } from '../src/decision/client.ts';
import { resolveProvider } from '../src/decision/providers.ts';
import { isCheckCommand } from '../src/features/stop-check/evidence.ts';
import { CHECK_FAILED, outcomeState } from '../src/features/stop-check/outcome.ts';
import { parseSession } from './sessions.ts';

type Sample = { id: string; command: string; output: string; failed: boolean };
type Row = { id: string; failed: boolean; probability: number | null; chars: number };

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

/** Every check command with a recorded exit status, once each. */
function samples(root: string): Sample[] {
  const seen = new Map<string, Sample>();
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const entry of readdirSync(join(root, project.name), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const text = readFileSync(join(root, project.name, entry.name), 'utf8');
      for (const turn of parseSession(text)) {
        const results = new Map<string, { text: string; isError: boolean }>();
        for (const message of turn.messages) {
          for (const result of message.toolResults ?? []) results.set(result.tool_use_id, result);
        }
        for (const message of turn.messages) {
          for (const use of message.toolUses) {
            const command = use.input.command;
            const result = results.get(use.tool_use_id);
            if (use.tool !== 'Bash' || typeof command !== 'string' || !result) continue;
            if (!isCheckCommand(command) || seen.has(use.tool_use_id)) continue;
            seen.set(use.tool_use_id, {
              id: use.tool_use_id,
              command,
              output: result.text,
              failed: result.isError,
            });
          }
        }
      }
    }
  }
  return [...seen.values()];
}

function report(rows: readonly Row[]): string {
  const scored = rows.filter((row) => row.probability !== null);
  const failed = scored.filter((row) => row.failed);
  const passed = scored.filter((row) => !row.failed);
  const lines = [
    `${rows.length} check commands with a recorded exit status; ${scored.length} scored`,
    `  exited with an error: ${failed.length}; exited cleanly: ${passed.length}`,
  ];
  for (const [low, high] of [
    [0.3, 0.7],
    [0.2, 0.8],
    [0.5, 0.5],
  ] as const) {
    const calledFailed = scored.filter((row) => (row.probability ?? 0) >= high);
    const calledPassed = scored.filter((row) => (row.probability ?? 1) <= low && low !== high);
    const passedLow =
      low === high ? scored.filter((row) => (row.probability ?? 1) < low) : calledPassed;
    const between = scored.length - calledFailed.length - passedLow.length;
    lines.push(
      `  failed at >= ${high}, passed at ${low === high ? '<' : '<='} ${low}:`,
      `    called failed: ${calledFailed.length}, of which exited cleanly: ${calledFailed.filter((row) => !row.failed).length}`,
      `    called passed: ${passedLow.length}, of which exited with an error: ${passedLow.filter((row) => row.failed).length}`,
      `    left unknown: ${between}`,
    );
  }
  return lines.join('\n');
}

const nodeFetch: Fetch = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status, ok: response.ok, text: await response.text() };
};

async function main(): Promise<void> {
  const out = option('out') ?? join('eval', 'out');
  const path = join(out, 'check-outcome.jsonl');
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
    const ask = createAsker({
      apiKey,
      fetch: nodeFetch,
      sleep,
      url: provider.url,
      model: provider.model,
    });
    rows = [];
    const size = 8;
    for (let at = 0; at < all.length; at += size) {
      const batch = all.slice(at, at + size);
      const scored = await Promise.all(
        batch.map(async (sample): Promise<Row> => {
          const row: Row = {
            id: sample.id,
            failed: sample.failed,
            probability: null,
            chars: sample.output.length,
          };
          if (!send) return row;
          try {
            const answered = await ask(
              outcomeState(sample.command, sample.output, createRedactor()),
              { check_failed: CHECK_FAILED },
            );
            row.probability = answered.answers.check_failed?.noul ?? null;
          } catch {
            row.probability = null;
          }
          return row;
        }),
      );
      rows.push(...scored);
    }
    writeFileSync(path, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  }
  const summary = report(rows);
  writeFileSync(join(out, 'check-outcome-report.txt'), `${summary}\n`);
  console.log(summary);
}

await main();
