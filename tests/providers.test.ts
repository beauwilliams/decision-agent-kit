import { describe, expect, it } from 'vitest';

import { createAsker, type Fetch } from '../src/decision/client.ts';
import { DEFAULT_PROVIDER, resolveProvider } from '../src/decision/providers.ts';
import { resolveConfig, resolveKey, stopCheckEntry } from '../hooks/register.ts';
import type { StopCheckResult } from '../src/features/stop-check/check.ts';

describe('resolveProvider', () => {
  it.each([
    ['subq', 'https://api.subq.ai/v1/systemone', 'subq-snap-1.2', 'SUBQ_API_KEY'],
    ['jev', 'https://api.typesafe.ai/v1/systemone', 'jev-1.14.0', 'JEV_API_KEY'],
    ['sage', 'https://sage.levanto.ai/v1/systemone', 'levanto-sage-2', 'LEVANTO_API_KEY'],
  ])('%s resolves to its URL, pinned model and key variable', (id, url, model, keyVariable) => {
    expect(resolveProvider(id)).toMatchObject({ id, url, model, keyVariable });
  });

  it('falls back to subq for an unknown or missing id', () => {
    expect(DEFAULT_PROVIDER).toBe('subq');
    expect(resolveProvider('nope').id).toBe('subq');
    expect(resolveProvider('toString').id).toBe('subq');
    expect(resolveProvider(undefined).id).toBe('subq');
  });
});

describe('resolveConfig', () => {
  it('takes the pinned model from the provider and lets model override it', () => {
    expect(resolveConfig({ provider: 'sage' })).toMatchObject({ model: 'levanto-sage-2' });
    expect(resolveConfig({ provider: 'sage', model: 'other' }).model).toBe('other');
    expect(resolveConfig({}).provider.id).toBe('subq');
  });
});

describe('resolveKey', () => {
  const env: Record<string, string> = { SUBQ_API_KEY: 'subq-secret', JEV_API_KEY: 'jev-secret' };

  it('reads only the chosen provider variable and sends the Jev key to the Jev URL', async () => {
    const config = resolveConfig({ provider: 'jev' });
    const looked: string[] = [];
    const key = await resolveKey(config, async (name) => {
      looked.push(name);
      return env[name];
    });
    expect(looked).toEqual(['JEV_API_KEY']);

    const sent: { url: string; authorization: string | undefined }[] = [];
    const fetch: Fetch = async (url, init) => {
      sent.push({ url, authorization: init.headers.authorization });
      return { status: 200, ok: true, text: '{"answers":{"q":{"noul":0.5}}}' };
    };
    const ask = createAsker({
      apiKey: key ?? '',
      fetch,
      sleep: async () => {},
      url: config.provider.url,
      model: config.model,
    });
    await ask('state', { q: { type: 'noul', instructions: 'yes?' } });
    expect(sent).toEqual([
      { url: 'https://api.typesafe.ai/v1/systemone', authorization: 'Bearer jev-secret' },
    ]);
    expect(JSON.stringify(sent)).not.toContain('subq-secret');
  });

  it('prefers the apiKey option without looking anything up', async () => {
    const config = resolveConfig({ provider: 'sage', apiKey: 'option-key' });
    const key = await resolveKey(config, async () => {
      throw new Error('no lookup expected');
    });
    expect(key).toBe('option-key');
  });

  it('returns nothing when the chosen variable is unset', async () => {
    const config = resolveConfig({ provider: 'sage' });
    expect(await resolveKey(config, async (name) => env[name])).toBeUndefined();
  });
});

describe('stopCheckEntry', () => {
  it('carries the provider id and model', () => {
    const result: StopCheckResult = {
      verdict: 'ok',
      asked: true,
      findings: [],
      probabilities: {},
      facts: { toolCalls: 3, filesEdited: 1, checksRun: 1 },
      inputTokens: 12,
    } as unknown as StopCheckResult;
    const entry = stopCheckEntry(resolveConfig({ provider: 'jev' }), 't1', result, 40, 'now');
    expect(entry).toMatchObject({
      feature: 'stop-check',
      provider: 'jev',
      model: 'jev-1.14.0',
      mode: 'shadow',
      turnId: 't1',
      ms: 40,
    });
  });
});
