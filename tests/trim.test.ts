import { describe, expect, it } from 'vitest';

import type { Asker, Question } from '../src/decision/client.ts';
import {
  applyTrim,
  DEFAULT_TRIM_OPTIONS,
  decideTrim,
  planTrim,
  type TrimContext,
  type TrimOptions,
} from '../src/features/trim/trim.ts';

const CONTEXT: TrimContext = {
  request: 'fix the build',
  command: 'make build',
  intent: 'building',
};
const OPTIONS: TrimOptions = { ...DEFAULT_TRIM_OPTIONS, trimThreshold: 100 };

function noise(count: number, prefix = 'progress'): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix} step ${i}`);
}

/** 20 head lines, a middle, 40 tail lines. */
function output(middle: string[]): string {
  return [...noise(20, 'head'), ...middle, ...noise(40, 'tail')].join('\n');
}

type Call = { state: unknown; questions: Record<string, Question> };

function fakeAsker(answers: Record<string, number | undefined>): { ask: Asker; calls: Call[] } {
  const calls: Call[] = [];
  const ask: Asker = async (state, questions) => {
    calls.push({ state, questions });
    return {
      answers: Object.fromEntries(
        Object.entries(answers).map(([id, noul]) => [id, noul === undefined ? {} : { noul }]),
      ),
      inputTokens: 7,
      requests: 1,
    };
  };
  return { ask, calls };
}

describe('planTrim', () => {
  it('returns nothing under the threshold', async () => {
    const short = 'a\n'.repeat(10);
    expect(planTrim(short)).toBeUndefined();
    const { ask, calls } = fakeAsker({});
    expect(await decideTrim(short, CONTEXT, ask)).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('returns nothing when the rules keep every line', () => {
    expect(planTrim(noise(60).join('\n'), OPTIONS)).toBeUndefined();
  });

  it('protects the head and the tail', () => {
    const plan = planTrim(output(noise(30)), OPTIONS);
    expect(plan?.protectedLines.slice(0, 20).every(Boolean)).toBe(true);
    expect(plan?.protectedLines.slice(-40).every(Boolean)).toBe(true);
    expect(plan?.blocks).toEqual([{ start: 20, end: 50 }]);
  });

  it('protects an error line and two lines either side', () => {
    const middle = noise(30);
    middle[15] = 'something went wrong: Error in module';
    const plan = planTrim(output(middle), OPTIONS);
    const at = 20 + 15;
    for (let i = at - 2; i <= at + 2; i++) expect(plan?.protectedLines[i]).toBe(true);
    expect(plan?.protectedLines[at - 3]).toBe(false);
    expect(plan?.protectedLines[at + 3]).toBe(false);
  });

  it.each(['src/a.ts:12', 'a.py:3:4', 'file.rs(21,10)'])('protects a line naming %s', (name) => {
    const middle = noise(30);
    middle[15] = `see ${name} for detail`;
    const plan = planTrim(output(middle), OPTIONS);
    expect(plan?.protectedLines[35]).toBe(true);
  });

  it('splits a run into blocks of at most blockLines', () => {
    const plan = planTrim(output(noise(100)), OPTIONS);
    expect(plan?.blocks).toEqual([
      { start: 20, end: 60 },
      { start: 60, end: 100 },
      { start: 100, end: 120 },
    ]);
  });

  it('treats a run shorter than three lines as protected', () => {
    const plan = planTrim(output(noise(2)), OPTIONS);
    expect(plan).toBeUndefined();
  });
});

describe('decideTrim', () => {
  it('asks about at most maxBlocks and keeps the later ones', async () => {
    const options = { ...OPTIONS, maxBlocks: 2, blockLines: 10 };
    const { ask, calls } = fakeAsker({ b0: 0.1, b1: 0.1, b2: 0.0 });
    const decision = await decideTrim(output(noise(50)), CONTEXT, ask, options);
    expect(Object.keys(calls[0]?.questions ?? {})).toEqual(['b0', 'b1']);
    expect(decision?.blocks).toBe(5);
    expect(decision?.asked).toBe(2);
    expect(decision?.cut).toHaveLength(2);
  });

  it('cuts only at or below the threshold and keeps a missing answer', async () => {
    const options = { ...OPTIONS, blockLines: 10 };
    const { ask } = fakeAsker({ b0: 0.2, b1: 0.21, b2: undefined });
    const decision = await decideTrim(output(noise(30)), CONTEXT, ask, options);
    expect(decision?.cut.map((cut) => cut.start)).toEqual([20]);
    expect(decision?.inputTokens).toBe(7);
  });

  it('keeps a block whose answer is not finite', async () => {
    const { ask } = fakeAsker({ b0: Number.NaN });
    const decision = await decideTrim(output(noise(30)), CONTEXT, ask, OPTIONS);
    expect(decision?.cut).toEqual([]);
  });

  it('counts the characters of the removed lines', async () => {
    const middle = noise(30);
    const { ask } = fakeAsker({ b0: 0 });
    const decision = await decideTrim(output(middle), CONTEXT, ask, OPTIONS);
    expect(decision?.cutChars).toBe(middle.reduce((sum, line) => sum + line.length + 1, 0));
    const trimmed = applyTrim(output(middle), decision?.cut ?? [], '/x');
    const marker = '[decision-agent-kit cut 30 lines; full output: /x]';
    expect(trimmed.length).toBe(
      output(middle).length - (decision?.cutChars ?? 0) + marker.length + 1,
    );
  });

  it('lets a failed request throw', async () => {
    const ask: Asker = async () => {
      throw new Error('down');
    };
    await expect(decideTrim(output(noise(30)), CONTEXT, ask, OPTIONS)).rejects.toThrow('down');
  });

  it('redacts what it sends and not what it keeps', async () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz012345';
    const middle = noise(30);
    middle[10] = `token ${secret}`;
    const source = output(middle).replace('head step 3', `head ${secret}`);
    const { ask, calls } = fakeAsker({ b0: 0 });
    const decision = await decideTrim(
      source,
      { ...CONTEXT, command: `curl -H "x: ${secret}"` },
      ask,
      OPTIONS,
    );
    expect(JSON.stringify(calls[0]?.state)).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
    expect(JSON.stringify(calls[0]?.state)).toContain('[redacted:api-key]');
    expect(decision?.redactions).toBe(2);
    expect(applyTrim(source, decision?.cut ?? [], '/x')).toContain(`head ${secret}`);
  });
});

describe('applyTrim', () => {
  const source = output(noise(100));

  it('is the identity with no cuts', () => {
    expect(applyTrim(source, [], '/x')).toBe(source);
  });

  it('merges adjacent cut blocks into one marker', () => {
    const trimmed = applyTrim(
      source,
      [
        { start: 20, end: 60 },
        { start: 60, end: 100 },
      ],
      '/x',
    );
    const lines = trimmed.split('\n');
    expect(lines[20]).toBe('[decision-agent-kit cut 80 lines; full output: /x]');
    expect(lines).toHaveLength(source.split('\n').length - 80 + 1);
  });

  it('writes one marker per separate run', () => {
    const trimmed = applyTrim(
      source,
      [
        { start: 20, end: 60 },
        { start: 100, end: 120 },
      ],
      '/x',
    );
    expect(trimmed.match(/decision-agent-kit cut/g)).toHaveLength(2);
    expect(trimmed).toContain('cut 40 lines');
    expect(trimmed).toContain('cut 20 lines');
  });
});
