import type { EngineInterface, PluginOptions, Register } from 'claude-code';

import { createAsker, type Fetch } from '../src/decision/client.ts';
import { resolveProvider, type Provider } from '../src/decision/providers.ts';
import {
  checkStop,
  DEFAULT_STOP_CHECK_OPTIONS,
  type StopCheckOptions,
} from '../src/features/stop-check/check.ts';
import {
  checkedEntries,
  findingsNote,
  formatEntry,
  parseLedger,
  skippedEntry,
  stopCheckEntry,
  summarize,
  withoutKey,
  type LedgerEntry,
  type Mode,
} from '../src/features/stop-check/ledger.ts';

type Config = {
  stopCheck: Mode;
  stopCheckOptions: StopCheckOptions;
  provider: Provider;
  apiKey: string | undefined;
  apiKeyCommand: string[];
  disabledPaths: string[];
  model: string;
  timeoutMs: number;
};

function text(options: PluginOptions, key: string): string | undefined {
  const value = options[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function number(options: PluginOptions, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mode(options: PluginOptions, key: string): Mode {
  const value = text(options, key);
  return value === 'off' || value === 'on' ? value : 'shadow';
}

export function resolveConfig(options: PluginOptions): Config {
  const provider = resolveProvider(text(options, 'provider'));
  return {
    stopCheck: mode(options, 'stopCheck'),
    stopCheckOptions: {
      claimThreshold: number(options, 'claimThreshold', DEFAULT_STOP_CHECK_OPTIONS.claimThreshold),
      unfinishedThreshold: number(
        options,
        'unfinishedThreshold',
        DEFAULT_STOP_CHECK_OPTIONS.unfinishedThreshold,
      ),
      waitingThreshold: number(
        options,
        'waitingThreshold',
        DEFAULT_STOP_CHECK_OPTIONS.waitingThreshold,
      ),
      minToolCalls: DEFAULT_STOP_CHECK_OPTIONS.minToolCalls,
      codeChangeThreshold: DEFAULT_STOP_CHECK_OPTIONS.codeChangeThreshold,
      checkFailedThreshold: DEFAULT_STOP_CHECK_OPTIONS.checkFailedThreshold,
      checkPassedThreshold: DEFAULT_STOP_CHECK_OPTIONS.checkPassedThreshold,
    },
    provider,
    apiKey: text(options, 'apiKey'),
    apiKeyCommand: (text(options, 'apiKeyCommand') ?? '').split(/\s+/).filter(Boolean),
    disabledPaths: (text(options, 'disabledPaths') ?? '')
      .split(',')
      .map((path) => path.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    model: text(options, 'model') ?? provider.model,
    timeoutMs: number(options, 'timeoutMs', 8000),
  };
}

export function isDisabledFor(cwd: string, disabledPaths: readonly string[]): boolean {
  return disabledPaths.some((path) => cwd === path || cwd.startsWith(`${path}/`));
}

const cachedKeys = new Map<string, string>();

// The validator wants a literal name in each $.env.get call, so each key
// variable is read by its own case.
async function readKeyVariable($: EngineInterface, name: string): Promise<string | undefined> {
  switch (name) {
    case 'SUBQ_API_KEY':
      return await $.env.get('SUBQ_API_KEY');
    case 'JEV_API_KEY':
      return await $.env.get('JEV_API_KEY');
    case 'LEVANTO_API_KEY':
      return await $.env.get('LEVANTO_API_KEY');
    default:
      return undefined;
  }
}

/** Only the chosen provider's variable is looked up, so another provider's key is never read. */
export async function resolveKey(
  config: Pick<Config, 'apiKey' | 'provider'>,
  lookup: (name: string) => Promise<string | undefined>,
): Promise<string | undefined> {
  return config.apiKey ?? (await lookup(config.provider.keyVariable));
}

async function apiKey($: EngineInterface, config: Config): Promise<string> {
  const cached = cachedKeys.get(config.provider.id);
  if (cached) return cached;
  let key = await resolveKey(config, (name) => readKeyVariable($, name));
  if (!key && config.apiKeyCommand.length > 0) {
    const ran = await $.process.run(config.apiKeyCommand, { timeoutMs: 10_000 });
    if (ran.exitCode === 0) key = ran.stdout.trim();
  }
  if (!key) {
    throw new Error(
      `no ${config.provider.name} API key: set apiKey, ${config.provider.keyVariable} or apiKeyCommand`,
    );
  }
  cachedKeys.set(config.provider.id, key);
  return key;
}

async function ledgerPath($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '';
  return `${home}/.claude/decision-agent-kit/ledger/${await $.session.id()}.jsonl`;
}

async function readLedger($: EngineInterface): Promise<string> {
  const path = await ledgerPath($);
  return (await $.fs.exists(path)) ? await $.fs.read(path) : '';
}

async function record($: EngineInterface, entry: LedgerEntry): Promise<void> {
  const existing = await readLedger($);
  await $.fs.write(await ledgerPath($), `${existing}${formatEntry(entry)}`);
}

async function entries($: EngineInterface): Promise<LedgerEntry[]> {
  return parseLedger(await readLedger($));
}

function ledgerSettings(config: Config): { mode: Mode; provider: string; model: string } {
  return { mode: config.stopCheck, provider: config.provider.id, model: config.model };
}

export const register: Register = (on, options) => {
  const config = resolveConfig(options);

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'decisions',
      description: 'Show what the decision checks decided this session, or label the last one',
      argumentHint: '[good|bad]',
    });
    return next(e);
  });

  on('command.run', { command: 'decisions' }, async ($, e) => {
    const all = await entries($);
    const last = checkedEntries(all).at(-1);
    const label = e.args.trim();
    if (label === 'good' || label === 'bad') {
      if (!last) return { text: 'Nothing to label yet.' };
      await record($, {
        at: new Date().toISOString(),
        feature: 'label',
        label,
        turnId: last.turnId,
      });
      return { text: `Labelled the last stop check ${label}.` };
    }
    const lines = summarize(all, {
      mode: config.stopCheck,
      providerName: config.provider.name,
      model: config.model,
    });
    if (isDisabledFor(await $.session.cwd(), config.disabledPaths)) {
      lines.push('Checks are disabled for this directory.');
    }
    return { text: lines.join('\n') };
  });

  on('turn.complete', async ($, e, next) => {
    const settled = await next(e);
    if (config.stopCheck === 'off' || e.agentId !== undefined || e.reason !== 'answer') {
      return settled;
    }
    let key: string | undefined;
    try {
      if (isDisabledFor(await $.session.cwd(), config.disabledPaths)) return settled;
      const started = Date.now();
      const fetch: Fetch = async (url, init) => {
        const response = await $.http.fetch(url, init);
        return { status: response.status, ok: response.ok, text: response.text };
      };
      const sleep = (ms: number): Promise<unknown> => $.clock.sleep(ms);
      const ask = createAsker({
        get apiKey() {
          return key ?? '';
        },
        fetch,
        sleep,
        url: config.provider.url,
        model: config.model,
        maxRetries: 1,
      });
      const messages = await $.session.messages();
      const timeout = sleep(config.timeoutMs).then(() => {
        throw new Error(`timed out after ${config.timeoutMs} ms`);
      });
      const result = await Promise.race([
        checkStop(
          messages,
          e.answer,
          async (state, questions) => {
            key = await apiKey($, config);
            return ask(state, questions);
          },
          config.stopCheckOptions,
        ),
        timeout,
      ]);
      await record(
        $,
        stopCheckEntry(
          ledgerSettings(config),
          e.turnId,
          result,
          Date.now() - started,
          new Date().toISOString(),
        ),
      );
      if (config.stopCheck !== 'on' || result.findings.length === 0) return settled;
      const note = findingsNote(result);
      $.ui.toast(note, { timeoutMs: 12_000 });
      return { ...settled, text: note };
    } catch (error) {
      const reason = withoutKey(error instanceof Error ? error.message : String(error), key);
      $.ui.log(`stop check skipped: ${reason}`);
      try {
        await record(
          $,
          skippedEntry(ledgerSettings(config), e.turnId, reason, new Date().toISOString()),
        );
      } catch {
        // Best effort: the log line above already carries the reason.
      }
      return settled;
    }
  });
};
