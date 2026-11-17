import type { EngineInterface, PluginOptions, Register } from 'claude-code';

import { createAsker, DEFAULT_MODEL, type Fetch } from '../src/subq/client.ts';
import {
  checkStop,
  DEFAULT_STOP_CHECK_OPTIONS,
  type StopCheckOptions,
  type StopCheckResult,
} from '../src/features/stop-check/check.ts';

type Mode = 'off' | 'shadow' | 'on';

type Config = {
  stopCheck: Mode;
  stopCheckOptions: StopCheckOptions;
  apiKey: string | undefined;
  apiKeyCommand: string[];
  disabledPaths: string[];
  model: string;
  timeoutMs: number;
};

type LedgerEntry = Record<string, unknown> & { at: string; feature: string };

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
  return {
    stopCheck: mode(options, 'stopCheck'),
    stopCheckOptions: {
      claimThreshold: number(options, 'claimThreshold', DEFAULT_STOP_CHECK_OPTIONS.claimThreshold),
      unfinishedThreshold: number(
        options,
        'unfinishedThreshold',
        DEFAULT_STOP_CHECK_OPTIONS.unfinishedThreshold,
      ),
      minToolCalls: DEFAULT_STOP_CHECK_OPTIONS.minToolCalls,
    },
    apiKey: text(options, 'apiKey'),
    apiKeyCommand: (text(options, 'apiKeyCommand') ?? '').split(/\s+/).filter(Boolean),
    disabledPaths: (text(options, 'disabledPaths') ?? '')
      .split(',')
      .map((path) => path.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    model: text(options, 'model') ?? DEFAULT_MODEL,
    timeoutMs: number(options, 'timeoutMs', 8000),
  };
}

export function isDisabledFor(cwd: string, disabledPaths: readonly string[]): boolean {
  return disabledPaths.some((path) => cwd === path || cwd.startsWith(`${path}/`));
}

export function findingsNote(result: StopCheckResult): string {
  return result.findings.map((finding) => `Stop check: ${finding.message}.`).join('\n');
}

let cachedKey: string | undefined;

async function apiKey($: EngineInterface, config: Config): Promise<string> {
  if (cachedKey) return cachedKey;
  let key = config.apiKey ?? (await $.env.get('SUBQ_API_KEY'));
  if (!key && config.apiKeyCommand.length > 0) {
    const ran = await $.process.run(config.apiKeyCommand, { timeoutMs: 10_000 });
    if (ran.exitCode === 0) key = ran.stdout.trim();
  }
  if (!key) throw new Error('no SubQ API key: set apiKey, SUBQ_API_KEY or apiKeyCommand');
  cachedKey = key;
  return key;
}

async function ledgerPath($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? '';
  return `${home}/.claude/subq-agent-kit/ledger/${await $.session.id()}.jsonl`;
}

async function readLedger($: EngineInterface): Promise<string> {
  const path = await ledgerPath($);
  return (await $.fs.exists(path)) ? await $.fs.read(path) : '';
}

async function record($: EngineInterface, entry: LedgerEntry): Promise<void> {
  const existing = await readLedger($);
  await $.fs.write(await ledgerPath($), `${existing}${JSON.stringify(entry)}\n`);
}

async function entries($: EngineInterface): Promise<LedgerEntry[]> {
  return (await readLedger($))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry);
}

export const register: Register = (on, options) => {
  const config = resolveConfig(options);

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'subq',
      description: 'Show what the SubQ checks decided this session, or label the last one',
      argumentHint: '[good|bad]',
    });
    return next(e);
  });

  on('command.run', { command: 'subq' }, async ($, e) => {
    const all = await entries($);
    const decisions = all.filter((entry) => entry.feature === 'stop-check');
    const last = decisions.at(-1);
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
    const flagged = decisions.filter(
      (entry) => Array.isArray(entry.findings) && entry.findings.length > 0,
    );
    const asked = decisions.filter((entry) => entry.asked === true);
    const lines = [
      `Stop check is ${config.stopCheck}. This session: ${decisions.length} turns checked, ${asked.length} asked of SubQ, ${flagged.length} flagged.`,
    ];
    if (last) {
      const found = (last.findings as { message: string }[] | undefined) ?? [];
      lines.push(
        `Last turn: ${String(last.verdict)}${found.length > 0 ? `; ${found.map((finding) => finding.message).join('; ')}` : '; nothing flagged'}.`,
      );
    }
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
    try {
      if (isDisabledFor(await $.session.cwd(), config.disabledPaths)) return settled;
      const started = Date.now();
      const fetch: Fetch = async (url, init) => {
        const response = await $.http.fetch(url, init);
        return { status: response.status, ok: response.ok, text: response.text };
      };
      const sleep = (ms: number): Promise<unknown> => $.clock.sleep(ms);
      let key: string | undefined;
      const ask = createAsker({
        get apiKey() {
          return key ?? '';
        },
        fetch,
        sleep,
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
      await record($, {
        at: new Date().toISOString(),
        feature: 'stop-check',
        mode: config.stopCheck,
        turnId: e.turnId,
        verdict: result.verdict,
        asked: result.asked,
        findings: result.findings,
        probabilities: result.probabilities,
        facts: result.facts,
        inputTokens: result.inputTokens,
        ms: Date.now() - started,
      });
      if (config.stopCheck !== 'on' || result.findings.length === 0) return settled;
      const note = findingsNote(result);
      $.ui.toast(note, { timeoutMs: 12_000 });
      return { ...settled, text: note };
    } catch (error) {
      $.ui.log(`stop check skipped: ${error instanceof Error ? error.message : String(error)}`);
      return settled;
    }
  });
};
