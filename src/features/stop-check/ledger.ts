import type { StopCheckResult } from './check.ts';

export type Mode = 'off' | 'shadow' | 'on';

export type LedgerEntry = Record<string, unknown> & { at: string; feature: string };

export type LedgerSettings = { mode: Mode; provider: string; model: string };

export function stopCheckEntry(
  settings: LedgerSettings,
  turnId: string,
  result: StopCheckResult,
  ms: number,
  at: string,
  harness?: string,
): LedgerEntry {
  return {
    at,
    feature: 'stop-check',
    mode: settings.mode,
    provider: settings.provider,
    model: settings.model,
    ...(harness === undefined ? {} : { harness }),
    turnId,
    verdict: result.verdict,
    asked: result.asked,
    findings: result.findings,
    probabilities: result.probabilities,
    facts: result.facts,
    inputTokens: result.inputTokens,
    ms,
  };
}

/** The entry for a check that could not run. */
export function skippedEntry(
  settings: LedgerSettings,
  turnId: string,
  reason: string,
  at: string,
  harness?: string,
): LedgerEntry {
  return {
    at,
    feature: 'stop-check',
    mode: settings.mode,
    provider: settings.provider,
    model: settings.model,
    ...(harness === undefined ? {} : { harness }),
    turnId,
    skipped: reason,
  };
}

/** A line that is not JSON is dropped: a half-written line must not hide the rest. */
export function parseLedger(text: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        entries.push(entry as LedgerEntry);
      }
    } catch {
      continue;
    }
  }
  return entries;
}

export function formatEntry(entry: LedgerEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/** The checks that ran: skipped entries and labels are left out. */
export function checkedEntries(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return entries.filter((entry) => entry.feature === 'stop-check' && entry.skipped === undefined);
}

export function findingsNote(result: StopCheckResult): string {
  return result.findings.map((finding) => `Stop check: ${finding.message}.`).join('\n');
}

/** Replaces every occurrence of the key, so a reason can be written or shown without it. */
export function withoutKey(text: string, key: string | undefined): string {
  return key ? text.split(key).join('[key]') : text;
}

export function summarize(
  entries: readonly LedgerEntry[],
  settings: { mode: Mode; providerName: string; model: string },
): string[] {
  const decisions = checkedEntries(entries);
  const flagged = decisions.filter(
    (entry) => Array.isArray(entry.findings) && entry.findings.length > 0,
  );
  const asked = decisions.filter((entry) => entry.asked === true);
  const lines = [
    `Stop check is ${settings.mode} (${settings.providerName}, ${settings.model}). This session: ${decisions.length} turns checked, ${asked.length} asked of the model, ${flagged.length} flagged.`,
  ];
  const last = decisions.at(-1);
  if (last) {
    const found = (last.findings as { message: string }[] | undefined) ?? [];
    lines.push(
      `Last turn: ${String(last.verdict)}${found.length > 0 ? `; ${found.map((finding) => finding.message).join('; ')}` : '; nothing flagged'}.`,
    );
  }
  const skipped = entries.filter(
    (entry) => entry.feature === 'stop-check' && entry.skipped !== undefined,
  );
  if (skipped.length > 0) {
    lines.push(`${skipped.length} checks could not run; last: ${String(skipped.at(-1)?.skipped)}.`);
  }
  return lines;
}
