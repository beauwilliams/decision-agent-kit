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
  unfinished?: number;
  toolCalls: number;
  filesEdited: number;
  checksRun: number;
  inputTokens: number;
  prompt: string;
  answer: string;
};

export type Label = { session: string; turn: number; claims?: boolean; unfinished?: boolean };

export const THRESHOLDS = [0.5, 0.6, 0.7, 0.8, 0.9];

type Question = 'claimsSuccess' | 'unfinished';

function count<T>(items: readonly T[], test: (item: T) => boolean): number {
  return items.reduce((sum, item) => sum + (test(item) ? 1 : 0), 0);
}

function percent(part: number, whole: number): string {
  return whole === 0 ? 'n/a' : `${Math.round((part / whole) * 100)}%`;
}

function sweep(rows: readonly Row[], labels: readonly Label[], question: Question): string[] {
  const scored = rows.filter((row) => typeof row[question] === 'number');
  const key = question === 'claimsSuccess' ? 'claims' : 'unfinished';
  const truth = new Map<string, boolean>();
  for (const label of labels) {
    const value = label[key];
    if (typeof value === 'boolean') truth.set(`${label.session}#${label.turn}`, value);
  }
  const labelled = scored.filter((row) => truth.has(`${row.session}#${row.turn}`));
  const lines = [`${question}: ${scored.length} turns scored, ${labelled.length} labelled`];
  for (const threshold of THRESHOLDS) {
    const flagged = count(scored, (row) => (row[question] ?? 0) >= threshold);
    let line = `  at ${threshold.toFixed(1)}: ${flagged} flagged (${percent(flagged, scored.length)})`;
    if (labelled.length > 0) {
      const isTrue = (row: Row): boolean => truth.get(`${row.session}#${row.turn}`) === true;
      const hit = (row: Row): boolean => (row[question] ?? 0) >= threshold;
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
  const verdicts: Verdict[] = ['nothing_to_check', 'verified', 'failing_check', 'unverified'];
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
    lines.push(...sweep(rows, labels, 'claimsSuccess'), ...sweep(rows, labels, 'unfinished'));
  }
  return lines.join('\n');
}
