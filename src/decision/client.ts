export const MAX_QUESTIONS_PER_REQUEST = 128;

/** A fetch reduced to what both a plugin host and Node can provide. */
export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; ok: boolean; text: string }>;

export type Question =
  | { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type Answer = {
  type?: string;
  noul?: number;
  choice?: string;
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type AskResult = {
  answers: Record<string, Answer>;
  inputTokens: number;
  requests: number;
};

export type Asker = (state: unknown, questions: Record<string, Question>) => Promise<AskResult>;

export class DecisionError extends Error {
  readonly status: number;
  readonly errorType: string;

  constructor(status: number, errorType: string, message: string) {
    super(`${status} ${errorType}: ${message}`);
    this.name = 'DecisionError';
    this.status = status;
    this.errorType = errorType;
  }

  get isOverTokenLimit(): boolean {
    return this.status === 400 && /token limit/i.test(this.message);
  }
}

export type AskerOptions = {
  apiKey: string;
  fetch: Fetch;
  sleep: (ms: number) => Promise<unknown>;
  model: string;
  url: string;
  /** Retries after the first attempt, for 429, 5xx and transport failures. */
  maxRetries?: number;
  /** Requests in flight at once when the questions need more than one. */
  concurrency?: number;
};

export function parseError(status: number, text: string): DecisionError {
  let errorType = 'error';
  let message = text.slice(0, 200);
  try {
    const body = JSON.parse(text) as {
      detail?: string | { error_type?: string; type?: string; message?: string };
      error?: { error_type?: string; type?: string; message?: string };
    };
    const detail = body.detail ?? body.error;
    if (typeof detail === 'string') {
      message = detail.slice(0, 200);
    } else if (detail && typeof detail === 'object') {
      errorType = detail.error_type ?? detail.type ?? errorType;
      message = (detail.message ?? message).slice(0, 200);
    }
  } catch {
    // Not JSON: the cut text is the message.
  }
  return new DecisionError(status, errorType, message);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function pooled<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * An asker over the Decisions API. Questions beyond the per-request limit are
 * split across requests that each carry the same state; a failed request
 * fails the whole ask.
 */
export function createAsker(options: AskerOptions): Asker {
  const { url, model } = options;
  const maxRetries = options.maxRetries ?? 2;
  const concurrency = Math.max(1, options.concurrency ?? 4);

  const askOnce = async (
    state: unknown,
    questions: Record<string, Question>,
  ): Promise<AskResult> => {
    const body = JSON.stringify({ model, state, questions });
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await options.sleep(500 * 2 ** (attempt - 1));
      let response: { status: number; ok: boolean; text: string };
      try {
        response = await options.fetch(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body,
        });
      } catch (error) {
        lastError = new DecisionError(
          0,
          'transport',
          error instanceof Error ? error.message.slice(0, 200) : 'request failed',
        );
        continue;
      }
      if (response.ok) {
        let parsed: { answers?: Record<string, Answer>; usage?: { input_tokens?: number } };
        try {
          parsed = JSON.parse(response.text) as typeof parsed;
        } catch {
          throw new DecisionError(response.status, 'malformed', 'response is not JSON');
        }
        if (!parsed.answers || typeof parsed.answers !== 'object') {
          throw new DecisionError(response.status, 'malformed', 'response has no answers');
        }
        return {
          answers: parsed.answers,
          inputTokens: parsed.usage?.input_tokens ?? 0,
          requests: 1,
        };
      }
      lastError = parseError(response.status, response.text);
      if (response.status !== 429 && response.status < 500) break;
    }
    throw lastError;
  };

  return async (state, questions) => {
    const entries = Object.entries(questions);
    if (entries.length === 0) return { answers: {}, inputTokens: 0, requests: 0 };
    const batches = chunk(entries, MAX_QUESTIONS_PER_REQUEST);
    const results = await pooled(batches, concurrency, (batch) =>
      askOnce(state, Object.fromEntries(batch)),
    );
    return {
      answers: Object.assign({}, ...results.map((result) => result.answers)) as Record<
        string,
        Answer
      >,
      inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
      requests: results.length,
    };
  };
}
