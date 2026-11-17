import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { checkStop } from '../src/features/stop-check/check.ts';
import { createAsker, type Asker, type Fetch } from '../src/subq/client.ts';
import { report, type Label, type Row } from './report.ts';
import { parseSession } from './sessions.ts';

const DEFAULT_EXCERPT = 700;

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

function sessionFiles(root: string): { project: string; path: string }[] {
  const files: { project: string; path: string }[] = [];
  for (const project of readdirSync(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const entry of readdirSync(join(root, project.name), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push({ project: project.name, path: join(root, project.name, entry.name) });
      }
    }
  }
  return files;
}

const nodeFetch: Fetch = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status, ok: response.ok, text: await response.text() };
};

const notSent: Asker = async () => ({ answers: {}, inputTokens: 0, requests: 0 });

function excerpt(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, 250)} [...] ${flat.slice(-(limit - 250))}`;
}

function finish(out: string, rows: Row[], save: boolean): void {
  mkdirSync(out, { recursive: true });
  if (save) {
    writeFileSync(
      join(out, 'replay.jsonl'),
      rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
    );
  }
  const labelPath = join(out, 'labels.jsonl');
  const labels: Label[] = existsSync(labelPath)
    ? readFileSync(labelPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Label)
    : [];
  const summary = report(rows, labels);
  writeFileSync(join(out, 'report.txt'), `${summary}\n`);
  console.log(summary);
}

async function main(): Promise<void> {
  const root = option('sessions') ?? join(homedir(), '.claude', 'projects');
  const out = option('out') ?? join('eval', 'out');
  const send = process.argv.includes('--ask');
  const limit = Number(option('excerpt') ?? DEFAULT_EXCERPT);
  const apiKey = process.env.SUBQ_API_KEY ?? '';
  if (send && apiKey === '') throw new Error('--ask needs SUBQ_API_KEY');
  const ask = send ? createAsker({ apiKey, fetch: nodeFetch, sleep }) : notSent;

  if (process.argv.includes('--report')) {
    const saved = readFileSync(join(out, 'replay.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Row);
    finish(out, saved, false);
    return;
  }

  const rows: Row[] = [];
  for (const file of sessionFiles(root)) {
    const session =
      file.path
        .split('/')
        .at(-1)
        ?.replace(/\.jsonl$/, '') ?? file.path;
    for (const turn of parseSession(readFileSync(file.path, 'utf8'))) {
      let sent = false;
      const result = await checkStop(turn.messages, turn.answer, async (state, questions) => {
        const answered = await ask(state, questions);
        sent = send;
        return answered;
      });
      const row: Row = {
        session,
        project: file.project,
        turn: turn.index,
        verdict: result.verdict,
        wouldAsk: result.asked,
        sent,
        ruleFinding: result.findings.some((finding) => finding.source === 'rule'),
        toolCalls: result.facts.toolCalls,
        filesEdited: result.facts.filesEdited,
        checksRun: result.facts.checksRun,
        inputTokens: result.inputTokens,
        prompt: excerpt(turn.prompt, limit),
        answer: excerpt(turn.answer, limit),
      };
      if (result.probabilities.claimsSuccess !== undefined) {
        row.claimsSuccess = result.probabilities.claimsSuccess;
      }
      if (result.probabilities.statesUnfinished !== undefined) {
        row.statesUnfinished = result.probabilities.statesUnfinished;
      }
      if (result.probabilities.needsUser !== undefined) {
        row.needsUser = result.probabilities.needsUser;
      }
      rows.push(row);
    }
  }

  finish(out, rows, true);
}

await main();
