import { describe, expect, it } from 'vitest';

import {
  formatEntry,
  parseLedger,
  skippedEntry,
  summarize,
  withoutKey,
} from '../src/features/stop-check/ledger.ts';

const old = {
  at: '2026-11-16T10:00:00.000Z',
  feature: 'stop-check',
  mode: 'shadow',
  turnId: 't1',
  verdict: 'unverified',
  asked: true,
  findings: [{ code: 'unverified_claim', message: 'the reply says it works' }],
  probabilities: { claimsSuccess: 0.9 },
  facts: { toolCalls: 4, filesEdited: 1, checksRun: 0, checksAfterLastEdit: 0 },
  inputTokens: 300,
  ms: 900,
};

describe('ledger', () => {
  it('reads an entry written before provider, model and harness existed', () => {
    const entries = parseLedger(`${JSON.stringify(old)}\n`);
    expect(entries).toEqual([old]);
    expect(summarize(entries, { mode: 'shadow', providerName: 'SubQ Snap', model: 'm' })).toEqual([
      'Stop check is shadow (SubQ Snap, m). This session: 1 turns checked, 1 asked of the model, 1 flagged.',
      'Last turn: unverified; the reply says it works.',
    ]);
  });

  it('skips blank and broken lines', () => {
    const text = `\n${formatEntry(old)}{"at":\nnot json\n[1]\n${formatEntry(old)}`;
    expect(parseLedger(text)).toHaveLength(2);
  });

  it('formats one JSON line with a trailing newline', () => {
    const line = formatEntry(old);
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trim().includes('\n')).toBe(false);
    expect(JSON.parse(line)).toEqual(old);
  });

  it('keeps skipped checks out of the turn count and reports them', () => {
    const skipped = skippedEntry(
      { mode: 'on', provider: 'subq', model: 'm' },
      't2',
      'timed out',
      'now',
    );
    expect(skipped).toEqual({
      at: 'now',
      feature: 'stop-check',
      mode: 'on',
      provider: 'subq',
      model: 'm',
      turnId: 't2',
      skipped: 'timed out',
    });
    const lines = summarize([old, skipped], { mode: 'on', providerName: 'P', model: 'm' });
    expect(lines[0]).toContain('1 turns checked');
    expect(lines[1]).toContain('Last turn: unverified');
    expect(lines[2]).toBe('1 checks could not run; last: timed out.');
  });

  it('replaces every occurrence of the key', () => {
    expect(withoutKey('a K b K', 'K')).toBe('a [key] b [key]');
    expect(withoutKey('a', undefined)).toBe('a');
  });
});
