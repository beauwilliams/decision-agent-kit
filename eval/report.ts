import type { Verdict } from '../src/features/stop-check/evidence.ts';

export type Row = {
  session: string;
  project: string;
  turn: number;
  verdict: Verdict;
  wouldAsk: boolean;
  sent: boolean;
  ruleFinding: boolean;
  claimsSuccess?: number;
  statesUnfinished?: number;
  needsUser?: number;
  changedCode?: number;
  toolCalls: number;
  filesEdited: number;
  checksRun: number;
  inputTokens: number;
  prompt: string;
  answer: string;
};

/** `needlessStop`: requested work is left undone and nothing is needed from the person. */
export type Label = { session: string; turn: number; claims?: boolean; needlessStop?: boolean };

export const WAITING_THRESHOLD = 0.5;

export const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];

type Score = (row: Row) => number | undefined;

function count<T>(items: readonly T[], test: (item: T) => boolean): number {
  return items.reduce((sum, item) => sum + (test(item) ? 1 : 0), 0);
}

function percent(part: number, whole: number): string {
  return whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`;
}

const claims: Score = (row) => row.claimsSuccess;

/** The unfinished finding's score: zero when the reply is waiting on the person. */
const needlessStop: Score = (row) => {
  if (row.statesUnfinished === undefined) return undefined;
  return (row.needsUser ?? 0) >= WAITING_THRESHOLD ? 0 : row.statesUnfinished;
};

function sweep(
  rows: readonly Row[],
  labels: readonly Label[],
  name: string,
  score: Score,
  key: 'claims' | 'needlessStop',
): string[] {
  const scored = rows.filter((row) => score(row) !== undefined);
  const truth = new Map<string, boolean>();
  for (const label of labels) {
    const value = label[key];
    if (typeof value === 'boolean') truth.set(`${label.session}#${label.turn}`, value);
  }
  const labelled = scored.filter((row) => truth.has(`${row.session}#${row.turn}`));
  const lines = [`${name}: ${scored.length} turns scored, ${labelled.length} labelled`];
  for (const threshold of THRESHOLDS) {
    const hit = (row: Row): boolean => (score(row) ?? 0) >= threshold;
    const flagged = count(scored, hit);
    let line = `  at ${threshold.toFixed(1)}: ${flagged} flagged (${percent(flagged, scored.length)})`;
    if (labelled.length > 0) {
      const isTrue = (row: Row): boolean => truth.get(`${row.session}#${row.turn}`) === true;
      const falseAlarms = count(labelled, (row) => hit(row) && !isTrue(row));
      const misses = count(labelled, (row) => !hit(row) && isTrue(row));
      const negatives = count(labelled, (row) => !isTrue(row));
      const positives = count(labelled, isTrue);
      line += `; false alarms ${falseAlarms}/${negatives}, misses ${misses}/${positives}`;
    }
    lines.push(line);
  }
  return lines;
}

/** A plain-text summary of a replay: what the rules settled and how each threshold would act. */
export function report(rows: readonly Row[], labels: readonly Label[] = []): string {
  const verdicts: Verdict[] = [
    'nothing_to_check',
    'verified',
    'failing_check',
    'unverified',
    'unknown',
  ];
  const sessions = new Set(rows.map((row) => row.session)).size;
  const projects = new Set(rows.map((row) => row.project)).size;
  const tokens = rows.reduce((sum, row) => sum + row.inputTokens, 0);
  const lines = [
    `${rows.length} turns from ${sessions} sessions in ${projects} projects`,
    ...verdicts.map((verdict) => {
      const n = count(rows, (row) => row.verdict === verdict);
      return `  ${verdict}: ${n} (${percent(n, rows.length)})`;
    }),
    `flagged by rule alone (failing check): ${count(rows, (row) => row.ruleFinding)}`,
    `turns the model would be asked about: ${count(rows, (row) => row.wouldAsk)} (${percent(
      count(rows, (row) => row.wouldAsk),
      rows.length,
    )})`,
    `sent: ${count(rows, (row) => row.sent)}, input tokens: ${tokens}`,
  ];
  if (rows.some((row) => row.sent)) {
    lines.push(
      ...sweep(rows, labels, 'unverified_claim', claims, 'claims'),
      ...sweep(rows, labels, 'unfinished', needlessStop, 'needlessStop'),
    );
  }
  return lines.join('\n');
}
