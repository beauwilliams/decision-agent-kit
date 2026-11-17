import { describe, expect, it } from 'vitest';

import { baselineCut, distinctiveTokens, harm, keptChars, lineSet } from '../eval/trim-measure.ts';

describe('distinctiveTokens', () => {
  it('takes long runs with a letter and a digit or a separator', () => {
    const tokens = distinctiveTokens(
      'src/core/redact.ts abcdefghijkl abc123def456 123456789012 short_1 snake_case_name_x',
    );
    expect(tokens).toContain('src/core/redact.ts');
    expect(tokens).toContain('abc123def456');
    expect(tokens).toContain('snake_case_name_x');
    expect(tokens).not.toContain('abcdefghijkl');
    expect(tokens).not.toContain('123456789012');
    expect(tokens).not.toContain('short_1');
  });
});

describe('harm', () => {
  const lines = ['keep src/kept/file.ts', 'cut src/only/cut.ts', 'cut src/kept/file.ts'];

  it('counts tokens found nowhere else and checks later text', () => {
    const cut = new Set([1, 2]);
    expect(harm(lines, cut, '', '', 'uses src/only/cut.ts')).toEqual({
      tokens: 1,
      used: 1,
      usedLater: true,
    });
    expect(harm(lines, cut, '', '', 'nothing')).toEqual({ tokens: 1, used: 0, usedLater: false });
  });

  it('ignores tokens in the command or request', () => {
    expect(harm(lines, new Set([1]), 'cat src/only/cut.ts', '', 'src/only/cut.ts').tokens).toBe(0);
  });
});

describe('baselineCut', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line number ${i}`);

  it('keeps at least as many characters as the model kept', () => {
    for (const modelKept of [0, 500, 1500, 2500]) {
      const block = baselineCut(lines, modelKept, 20, 40);
      const kept = keptChars(lines, lineSet(block ? [block] : []));
      if (block) {
        expect(block.start).toBeGreaterThanOrEqual(20);
        expect(block.end).toBe(160);
        expect(kept).toBeGreaterThanOrEqual(modelKept);
      }
    }
  });

  it('cuts nothing when the model kept everything', () => {
    expect(baselineCut(lines, keptChars(lines, new Set()), 20, 40)).toBeUndefined();
  });
});
