import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { patchFiles, turnMessages, type CodexEvent } from '../cli/codex.ts';
import { handle, type Deps } from '../cli/hook.ts';
import type { Fetch } from '../src/decision/client.ts';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/codex-turn.json', import.meta.url), 'utf8'),
) as CodexEvent[];
const SESSION = fixture[0]?.session_id ?? '';
const KEY = 'sk-test-DO-NOT-LEAK-123';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dak-cli-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function answering(answers: Record<string, number>, requests: string[] = []): Fetch {
  return async (_url, init) => {
    requests.push(init.headers.authorization ?? '');
    const body = JSON.parse(init.body) as { questions: Record<string, unknown> };
    const out = Object.fromEntries(
      Object.keys(body.questions).map((name) => [name, { type: 'noul', noul: answers[name] ?? 0 }]),
    );
    return {
      status: 200,
      ok: true,
      text: JSON.stringify({ answers: out, usage: { input_tokens: 9 } }),
    };
  };
}

function deps(env: Record<string, string | undefined>, fetch: Fetch = answering({})): Deps {
  return {
    env: { DECISION_AGENT_KIT_HOME: home, ...env },
    home,
    fetch,
    sleep: (ms) => (ms === 8000 ? new Promise(() => {}) : Promise.resolve()),
    now: () => new Date('2026-11-17T08:00:00Z'),
    runCommand: async () => ({ exitCode: 1, stdout: '' }),
  };
}

async function feed(
  events: readonly unknown[],
  d: Deps,
): Promise<{ stdout: string; stderr: string }[]> {
  const outputs = [];
  for (const event of events) outputs.push(await handle(JSON.stringify(event), d));
  return outputs;
}

function ledger(): Record<string, unknown>[] {
  const path = join(home, 'ledger', `${SESSION}.jsonl`);
  return existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
}

function everything(): string {
  return readdirSync(home, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

describe('the recorded Codex turn', () => {
  it('writes one stop check entry and removes the turn file', async () => {
    const d = deps({ SUBQ_API_KEY: KEY });
    const outputs = await feed(fixture, d);
    expect(outputs.every((output) => output.stdout === '' && output.stderr === '')).toBe(true);
    const entries = ledger();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      feature: 'stop-check',
      harness: 'codex',
      mode: 'shadow',
      provider: 'subq',
      verdict: 'verified',
      asked: true,
      facts: { filesEdited: 2 },
    });
    expect(existsSync(join(home, 'turns', `${SESSION}.jsonl`))).toBe(false);
  });

  it('records a failing check when the model reads the output as a failure', async () => {
    const d = deps({ SUBQ_API_KEY: KEY }, answering({ check_failed: 0.9 }));
    await feed(fixture, d);
    expect(ledger()[0]).toMatchObject({ verdict: 'failing_check' });
  });

  it('keeps state under owner-only permissions', async () => {
    await feed(fixture.slice(0, 2), deps({}));
    expect(statSync(join(home, 'turns')).mode & 0o777).toBe(0o700);
    expect(statSync(join(home, 'turns', `${SESSION}.jsonl`)).mode & 0o777).toBe(0o600);
  });

  it('drops the events of an earlier turn that never reached stop', async () => {
    const prompt = fixture[0] as CodexEvent;
    await handle(JSON.stringify({ ...prompt, turn_id: 'old' }), deps({}));
    await handle(JSON.stringify(prompt), deps({}));
    const lines = readFileSync(join(home, 'turns', `${SESSION}.jsonl`), 'utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ turn_id: prompt.turn_id });
  });
});

describe('a check that cannot run', () => {
  it('names the variable to set and records a skipped entry when there is no key', async () => {
    const outputs = await feed(fixture, deps({}));
    const last = outputs.at(-1);
    expect(last?.stdout).toBe('');
    expect(last?.stderr).toBe(
      'stop check skipped: no SubQ Snap API key: set SUBQ_API_KEY or DECISION_AGENT_KIT_KEY_COMMAND\n',
    );
    const entries = ledger();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ feature: 'stop-check', harness: 'codex' });
    expect(entries[0]?.skipped).toContain('SUBQ_API_KEY');
    expect(entries[0]).not.toHaveProperty('verdict');
  });

  it('takes the key from the key command', async () => {
    const requests: string[] = [];
    const d = deps({ DECISION_AGENT_KIT_KEY_COMMAND: 'pass show kit' }, answering({}, requests));
    let argv: string[] = [];
    d.runCommand = async (args) => {
      argv = args;
      return { exitCode: 0, stdout: `${KEY}\n` };
    };
    await feed(fixture, d);
    expect(argv).toEqual(['pass', 'show', 'kit']);
    expect(requests).toEqual([`Bearer ${KEY}`]);
    expect(ledger()[0]).toHaveProperty('verdict', 'verified');
  });

  it('records a timeout as skipped', async () => {
    const d = deps({ SUBQ_API_KEY: KEY }, () => new Promise(() => {}));
    d.sleep = () => Promise.resolve();
    const outputs = await feed(fixture, d);
    expect(outputs.at(-1)?.stderr).toContain('timed out after 8000 ms');
    expect(ledger()[0]?.skipped).toContain('timed out');
  });
});

describe('the key', () => {
  it('appears nowhere, even when the server echoes it back', async () => {
    const echo: Fetch = async () => ({
      status: 400,
      ok: false,
      text: JSON.stringify({ detail: `bad credentials ${KEY}` }),
    });
    const outputs = await feed(fixture, deps({ SUBQ_API_KEY: KEY }, echo));
    const seen = JSON.stringify(outputs) + everything();
    expect(seen).not.toContain(KEY);
    expect(outputs.at(-1)?.stderr).toContain('[key]');
    expect(ledger()[0]?.skipped).toContain('[key]');
  });

  it('stays out of output and files on a normal run', async () => {
    const outputs = await feed(fixture, deps({ SUBQ_API_KEY: KEY }));
    expect(JSON.stringify(outputs) + everything()).not.toContain(KEY);
  });
});

describe('modes', () => {
  const answers = { states_unfinished: 0.95, needs_user: 0.05 };

  it('on prints a systemMessage and nothing else', async () => {
    const outputs = await feed(
      fixture,
      deps({ SUBQ_API_KEY: KEY, DECISION_AGENT_KIT_STOP_CHECK: 'on' }, answering(answers)),
    );
    const out = outputs.at(-1);
    expect(out?.stderr).toBe('');
    const printed = JSON.parse(out?.stdout ?? '') as Record<string, unknown>;
    expect(Object.keys(printed)).toEqual(['systemMessage']);
    expect(printed.systemMessage).toContain('Stop check:');
    expect(ledger()[0]).toMatchObject({ mode: 'on' });
  });

  it('shadow prints nothing and still records the findings', async () => {
    const outputs = await feed(fixture, deps({ SUBQ_API_KEY: KEY }, answering(answers)));
    expect(outputs.every((output) => output.stdout === '')).toBe(true);
    expect(ledger()[0]?.findings).toHaveLength(1);
  });

  it('treats an unrecognised mode as shadow', async () => {
    const outputs = await feed(
      fixture,
      deps({ SUBQ_API_KEY: KEY, DECISION_AGENT_KIT_STOP_CHECK: 'loud' }, answering(answers)),
    );
    expect(outputs.at(-1)?.stdout).toBe('');
    expect(ledger()[0]).toMatchObject({ mode: 'shadow' });
  });

  it('off writes nothing', async () => {
    await feed(fixture, deps({ SUBQ_API_KEY: KEY, DECISION_AGENT_KIT_STOP_CHECK: 'off' }));
    expect(readdirSync(home)).toEqual([]);
  });

  it('does nothing when the stop hook is already active', async () => {
    const stop = { ...(fixture.at(-1) as CodexEvent), stop_hook_active: true };
    const out = await handle(JSON.stringify(stop), deps({ SUBQ_API_KEY: KEY }));
    expect(out).toEqual({ stdout: '', stderr: '' });
    expect(readdirSync(home)).toEqual([]);
  });
});

describe('where state is kept', () => {
  it('uses the plugin data folder when the harness gives one', async () => {
    const d = deps({ SUBQ_API_KEY: KEY });
    d.env = { PLUGIN_DATA: join(home, 'plugin-data'), SUBQ_API_KEY: KEY };
    await feed(fixture, d);
    expect(existsSync(join(home, 'plugin-data', 'ledger', `${SESSION}.jsonl`))).toBe(true);
  });
});

describe('bad input', () => {
  it.each(['../x', 'a/b', '..', 'a..b', ''])('refuses the session id %j', async (id) => {
    const event = { ...(fixture[0] as CodexEvent), session_id: id };
    const out = await handle(JSON.stringify(event), deps({}));
    expect(out.stderr).toContain('skipped');
    expect(readdirSync(home)).toEqual([]);
  });

  it.each(['', 'not json', '[1]', 'null', '{"hook_event_name":"Stop"}'])(
    'survives the input %j',
    async (input) => {
      const out = await handle(input, deps({}));
      expect(out.stdout).toBe('');
    },
  );

  it('ignores an unknown event', async () => {
    const event = { ...(fixture[0] as CodexEvent), hook_event_name: 'PreToolUse' };
    expect(await handle(JSON.stringify(event), deps({}))).toEqual({ stdout: '', stderr: '' });
    expect(readdirSync(home)).toEqual([]);
  });
});

describe('patchFiles', () => {
  it('lists added, updated, deleted and moved paths once each', () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: a.ts',
      '+x',
      '*** Update File: b.ts',
      '*** Move to: c/b.ts',
      '*** Delete File: d.ts',
      '*** Update File: a.ts',
      '*** End Patch',
    ].join('\n');
    expect(patchFiles(patch)).toEqual(['a.ts', 'b.ts', 'c/b.ts', 'd.ts']);
  });

  it('finds nothing in text that names no file', () => {
    expect(patchFiles('echo hi')).toEqual([]);
  });
});

describe('turnMessages', () => {
  it('maps the recorded turn', () => {
    const messages = turnMessages(fixture);
    expect(messages[0]).toMatchObject({ role: 'user', toolUses: [] });
    expect(messages[0]?.text).toContain('Fix the bug in add.js');
    expect(messages).toHaveLength(1 + 6 * 2);
    const uses = messages.flatMap((message) => message.toolUses);
    expect(uses.filter((use) => use.tool === 'Bash').every((use) => use.outcomeUnknown)).toBe(true);
    expect(uses.filter((use) => use.tool === 'Edit').map((use) => use.input)).toEqual([
      { file_path: 'add.test.js' },
      { file_path: 'add.js' },
    ]);
    expect(new Set(uses.map((use) => use.tool_use_id)).size).toBe(uses.length);
  });

  it('makes one Edit per file, and one with no path for a patch naming none', () => {
    const base = fixture[3] as CodexEvent & { hook_event_name: 'PostToolUse' };
    const patch = (command: string, id: string): CodexEvent => ({
      ...base,
      tool_input: { command },
      tool_use_id: id,
    });
    const stop = fixture.at(-1) as CodexEvent;
    const messages = turnMessages([
      patch('*** Add File: x\n*** Update File: y', 'p1'),
      patch('garbage', 'p2'),
      stop,
    ]);
    const uses = messages.flatMap((message) => message.toolUses);
    expect(uses.map((use) => [use.tool_use_id, use.input])).toEqual([
      ['p1#0', { file_path: 'x' }],
      ['p1#1', { file_path: 'y' }],
      ['p2#0', {}],
    ]);
  });

  it('passes other tools through and stringifies a non-string response', () => {
    const base = fixture[1] as CodexEvent & { hook_event_name: 'PostToolUse' };
    const event: CodexEvent = {
      ...base,
      tool_name: 'mcp__x__y',
      tool_input: { a: 1 },
      tool_response: { ok: true },
    };
    const messages = turnMessages([event, fixture.at(-1) as CodexEvent]);
    expect(messages[0]?.toolUses[0]).toMatchObject({ tool: 'mcp__x__y', input: { a: 1 } });
    expect(messages[0]?.toolUses[0]).not.toHaveProperty('outcomeUnknown');
    expect(messages[1]?.toolResults?.[0]?.text).toBe('{"ok":true}');
  });

  it('ignores events from another turn', () => {
    const other = fixture.map((event) => ({ ...event, turn_id: 'other' }));
    const second: CodexEvent[] = [
      { ...(fixture[0] as CodexEvent), turn_id: 'second', prompt: 'second prompt' } as CodexEvent,
      { ...(fixture[1] as CodexEvent), turn_id: 'second' } as CodexEvent,
      { ...(fixture.at(-1) as CodexEvent), turn_id: 'second' },
    ];
    const messages = turnMessages([...other.slice(0, -1), ...second]);
    expect(messages[0]?.text).toBe('second prompt');
    expect(messages).toHaveLength(3);
  });
});
