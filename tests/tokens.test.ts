import { describe, expect, it } from 'vitest';

import { DEFAULT_CHARS_PER_TOKEN, calibrate, estimateTokens } from '../src/core/tokens.ts';

describe('token sizing', () => {
  it('estimates from the ratio, rounding up', () => {
    expect(estimateTokens(3000, 3)).toBe(1000);
    expect(estimateTokens(10, 4)).toBe(3);
  });

  it('moves faster toward a denser observation than a sparser one', () => {
    const denser = calibrate(DEFAULT_CHARS_PER_TOKEN, 2000, 1000);
    const sparser = calibrate(DEFAULT_CHARS_PER_TOKEN, 3600, 1000);
    expect(denser).toBeLessThan(DEFAULT_CHARS_PER_TOKEN);
    expect(sparser).toBeGreaterThan(DEFAULT_CHARS_PER_TOKEN);
    expect(DEFAULT_CHARS_PER_TOKEN - denser).toBeGreaterThan(sparser - DEFAULT_CHARS_PER_TOKEN);
  });

  it('ignores an observation with no tokens and stays within bounds', () => {
    expect(calibrate(3, 1000, 0)).toBe(3);
    expect(calibrate(1.6, 1, 1000)).toBe(1.5);
  });
});
