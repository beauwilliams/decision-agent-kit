import { describe, expect, it } from 'vitest';

import { SubqError, createAsker, type Fetch, type Question } from '../src/subq/client.ts';

const noSleep = async (): Promise<void> => {};
const question: Question = { type: 'noul', instructions: 'yes?' };

function questions(count: number): Record<string, Question> {
  return Object.fromEntries(Array.from({ length: count }, (_, i) => [`q${i}`, question]));
}

function answering(calls: string[][]): Fetch {
  return async (_url, init) => {
    const body = JSON.parse(init.body) as { questions: Record<string, Question> };
    const names = Object.keys(body.questions);
    calls.push(names);
    const answers = Object.fromEntries(names.map((name) => [name, { type: 'noul', noul: 0.9 }]));
    return {
      status: 200,
      ok: true,
      text: JSON.stringify({ answers, usage: { input_tokens: 10 } }),
    };
  };
}

describe('createAsker', () => {
  it('splits questions over the per-request limit and merges the answers', async () => {
    const calls: string[][] = [];
    const ask = createAsker({ apiKey: 'k', fetch: answering(calls), sleep: noSleep });
    const result = await ask('state', questions(300));
    expect(calls.map((names) => names.length).sort()).toEqual([128, 128, 44]);
    expect(Object.keys(result.answers)).toHaveLength(300);
    expect(result).toMatchObject({ inputTokens: 30, requests: 3 });
  });

  it('sends nothing when there is nothing to ask', async () => {
    const calls: string[][] = [];
    const ask = createAsker({ apiKey: 'k', fetch: answering(calls), sleep: noSleep });
    expect(await ask('state', {})).toEqual({ answers: {}, inputTokens: 0, requests: 0 });
    expect(calls).toHaveLength(0);
  });

  it('retries a 429 and then succeeds', async () => {
    let attempts = 0;
    const fetch: Fetch = async () => {
      attempts += 1;
      return attempts === 1
        ? {
            status: 429,
            ok: false,
            text: '{"detail":{"error_type":"rate_limit","message":"slow"}}',
          }
        : { status: 200, ok: true, text: '{"answers":{"q0":{"noul":0.2}}}' };
    };
    const ask = createAsker({ apiKey: 'k', fetch, sleep: noSleep });
    expect((await ask('state', questions(1))).answers.q0?.noul).toBe(0.2);
    expect(attempts).toBe(2);
  });

  it('does not retry a 400 and reports the token limit', async () => {
    let attempts = 0;
    const fetch: Fetch = async () => {
      attempts += 1;
      return {
        status: 400,
        ok: false,
        text: '{"detail":{"error_type":"validation_error","message":"Input exceeds the token limit."}}',
      };
    };
    const ask = createAsker({ apiKey: 'k', fetch, sleep: noSleep });
    const error = await ask('state', questions(1)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SubqError);
    expect((error as SubqError).isOverTokenLimit).toBe(true);
    expect(attempts).toBe(1);
  });

  it('never puts the key in an error message', async () => {
    const fetch: Fetch = async () => {
      throw new Error('socket closed');
    };
    const ask = createAsker({ apiKey: 'sk-secret', fetch, sleep: noSleep, maxRetries: 1 });
    const error = (await ask('state', questions(1)).catch((caught: unknown) => caught)) as Error;
    expect(error.message).toContain('transport');
    expect(error.message).not.toContain('sk-secret');
  });
});
