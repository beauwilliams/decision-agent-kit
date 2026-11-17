import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as nodeSleep } from 'node:timers/promises';

import { createAsker, type Fetch } from '../src/decision/client.ts';
import { resolveProvider } from '../src/decision/providers.ts';
import { checkStop } from '../src/features/stop-check/check.ts';
import {
  findingsNote,
  formatEntry,
  skippedEntry,
  stopCheckEntry,
  withoutKey,
  type LedgerEntry,
  type LedgerSettings,
  type Mode,
} from '../src/features/stop-check/ledger.ts';
import { turnMessages, type CodexEvent, type StopEvent } from './codex.ts';

export type Deps = {
  env: Record<string, string | undefined>;
  home: string;
  fetch: Fetch;
  sleep: (ms: number) => Promise<unknown>;
  now: () => Date;
  runCommand: (argv: string[]) => Promise<{ exitCode: number; stdout: string }>;
};

export type Output = { stdout: string; stderr: string };

const HARNESS = 'codex';
const TIMEOUT_MS = 8000;
const SESSION_ID = /^[A-Za-z0-9._-]+$/;
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

function mode(env: Deps['env']): Mode {
  const value = env.DECISION_AGENT_KIT_STOP_CHECK;
  return value === 'off' || value === 'on' ? value : 'shadow';
}

function stateDir(deps: Deps): string {
  const { env } = deps;
  if (env.DECISION_AGENT_KIT_HOME) return env.DECISION_AGENT_KIT_HOME;
  if (env.XDG_STATE_HOME) return join(env.XDG_STATE_HOME, 'decision-agent-kit');
  return join(deps.home, '.local', 'state', 'decision-agent-kit');
}

function filePath(deps: Deps, folder: 'turns' | 'ledger', session: string): string {
  return join(stateDir(deps), folder, `${session}.jsonl`);
}

function ensureDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: DIR_MODE });
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function parseEvents(lines: readonly string[]): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as CodexEvent;
      if (event !== null && typeof event === 'object') events.push(event);
    } catch {
      continue;
    }
  }
  return events;
}

async function resolveKey(
  deps: Deps,
  provider: ReturnType<typeof resolveProvider>,
): Promise<string> {
  let key = deps.env[provider.keyVariable]?.trim();
  const command = (deps.env.DECISION_AGENT_KIT_KEY_COMMAND ?? '').split(/\s+/).filter(Boolean);
  if (!key && command.length > 0) {
    const ran = await deps.runCommand(command);
    if (ran.exitCode === 0) key = ran.stdout.trim();
  }
  if (!key) {
    throw new Error(
      `no ${provider.name} API key: set ${provider.keyVariable} or DECISION_AGENT_KIT_KEY_COMMAND`,
    );
  }
  return key;
}

async function stop(event: StopEvent, deps: Deps, turnFile: string): Promise<Output> {
  const provider = resolveProvider(deps.env.DECISION_AGENT_KIT_PROVIDER);
  const settings: LedgerSettings = {
    mode: mode(deps.env),
    provider: provider.id,
    model: provider.model,
  };
  const ledgerFile = filePath(deps, 'ledger', event.session_id);
  const started = deps.now();
  let key: string | undefined;
  const append = (entry: LedgerEntry): void => {
    ensureDir(ledgerFile);
    appendFileSync(ledgerFile, formatEntry(entry), { mode: FILE_MODE });
  };
  try {
    const events = [...parseEvents(readLines(turnFile)), event];
    let apiKey = '';
    const ask = createAsker({
      get apiKey() {
        return apiKey;
      },
      fetch: deps.fetch,
      sleep: deps.sleep,
      url: provider.url,
      model: provider.model,
      maxRetries: 1,
    });
    const timeout = deps.sleep(TIMEOUT_MS).then(() => {
      throw new Error(`timed out after ${TIMEOUT_MS} ms`);
    });
    const result = await Promise.race([
      checkStop(
        turnMessages(events),
        event.last_assistant_message ?? '',
        async (state, questions) => {
          key = await resolveKey(deps, provider);
          apiKey = key;
          return ask(state, questions);
        },
      ),
      timeout,
    ]);
    append(
      stopCheckEntry(
        settings,
        event.turn_id,
        result,
        deps.now().getTime() - started.getTime(),
        deps.now().toISOString(),
        HARNESS,
      ),
    );
    if (settings.mode !== 'on' || result.findings.length === 0) return { stdout: '', stderr: '' };
    return {
      stdout: JSON.stringify({ systemMessage: withoutKey(findingsNote(result), key) }),
      stderr: '',
    };
  } catch (error) {
    const reason = withoutKey(error instanceof Error ? error.message : String(error), key);
    try {
      append(skippedEntry(settings, event.turn_id, reason, deps.now().toISOString(), HARNESS));
    } catch {
      // The reason still reaches stderr.
    }
    return { stdout: '', stderr: `stop check skipped: ${reason}\n` };
  } finally {
    rmSync(turnFile, { force: true });
  }
}

function accumulate(event: CodexEvent, turnFile: string): void {
  const line = `${JSON.stringify(event)}\n`;
  ensureDir(turnFile);
  // Tool calls can finish together, each in its own process: an append cannot lose another's line.
  if (event.hook_event_name !== 'UserPromptSubmit') {
    appendFileSync(turnFile, line, { mode: FILE_MODE });
    return;
  }
  const kept = readLines(turnFile).filter((earlier) => {
    try {
      return (JSON.parse(earlier) as CodexEvent).turn_id === event.turn_id;
    } catch {
      return false;
    }
  });
  writeFileSync(turnFile, kept.map((earlier) => `${earlier}\n`).join('') + line, {
    mode: FILE_MODE,
  });
}

/** Never throws: a hook must not disturb the harness it runs in. */
export async function handle(input: string, deps: Deps): Promise<Output> {
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return { stdout: '', stderr: 'stop check skipped: input is not JSON\n' };
    }
    if (parsed === null || typeof parsed !== 'object') {
      return { stdout: '', stderr: 'stop check skipped: input is not an event\n' };
    }
    const event = parsed as CodexEvent;
    const name: unknown = event.hook_event_name;
    if (name !== 'UserPromptSubmit' && name !== 'PostToolUse' && name !== 'Stop') {
      return { stdout: '', stderr: '' };
    }
    if (mode(deps.env) === 'off') return { stdout: '', stderr: '' };
    const session: unknown = event.session_id;
    if (
      typeof session !== 'string' ||
      !SESSION_ID.test(session) ||
      session.includes('..') ||
      typeof event.turn_id !== 'string'
    ) {
      return { stdout: '', stderr: 'stop check skipped: unusable session_id or turn_id\n' };
    }
    const turnFile = filePath(deps, 'turns', session);
    if (event.hook_event_name === 'Stop') {
      if (event.stop_hook_active === true) return { stdout: '', stderr: '' };
      return await stop(event, deps, turnFile);
    }
    accumulate(event, turnFile);
    return { stdout: '', stderr: '' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { stdout: '', stderr: `stop check skipped: ${reason}\n` };
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function write(stream: NodeJS.WriteStream, text: string): Promise<void> {
  return new Promise((resolve) => {
    if (text === '') resolve();
    else stream.write(text, () => resolve());
  });
}

const nodeFetch: Fetch = async (url, init) => {
  const response = await fetch(url, init);
  return { status: response.status, ok: response.ok, text: await response.text() };
};

function runCommand(argv: string[]): Promise<{ exitCode: number; stdout: string }> {
  return new Promise((resolve) => {
    const [file, ...args] = argv;
    if (!file) {
      resolve({ exitCode: 1, stdout: '' });
      return;
    }
    execFile(file, args, { timeout: 10_000, encoding: 'utf8' }, (error, stdout) => {
      resolve({
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout,
      });
    });
  });
}

async function main(): Promise<void> {
  let output: Output;
  try {
    output = await handle(await readStdin(), {
      env: process.env,
      home: homedir(),
      fetch: nodeFetch,
      sleep: (ms) => nodeSleep(ms),
      now: () => new Date(),
      runCommand,
    });
  } catch (error) {
    output = {
      stdout: '',
      stderr: `stop check skipped: ${error instanceof Error ? error.message : String(error)}\n`,
    };
  }
  await write(process.stderr, output.stderr);
  await write(process.stdout, output.stdout);
  // The timeout timer would otherwise keep the process alive after the check finishes.
  process.exit(0);
}

if (import.meta.main) await main();
