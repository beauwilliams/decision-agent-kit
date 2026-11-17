/**
 * Starting ratio for sizing a request without a tokenizer. Deliberately low:
 * JSON-heavy state measured near 2.5 characters per token, and an estimate
 * that undercounts fails the whole request with a 400.
 */
export const DEFAULT_CHARS_PER_TOKEN = 2.8;

const MIN_CHARS_PER_TOKEN = 1.5;
const MAX_CHARS_PER_TOKEN = 6;

export function estimateTokens(
  chars: number,
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): number {
  return Math.ceil(chars / charsPerToken);
}

/**
 * Moves the ratio toward what a request actually cost (`usage.input_tokens`),
 * faster when the observation says the estimate was too optimistic.
 */
export function calibrate(previous: number, chars: number, tokens: number): number {
  if (!(chars > 0) || !(tokens > 0)) return previous;
  const observed = chars / tokens;
  const weight = observed < previous ? 0.6 : 0.2;
  const next = previous + (observed - previous) * weight;
  return Math.min(MAX_CHARS_PER_TOKEN, Math.max(MIN_CHARS_PER_TOKEN, next));
}
