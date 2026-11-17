import { describe, expect, it } from 'vitest';

import type { Message, ToolUse } from '../src/core/transcript.ts';
import type { Asker, Question } from '../src/decision/client.ts';
import { checkStop } from '../src/features/stop-check/check.ts';
import { outputExcerpt } from '../src/features/stop-check/outcome.ts';
import {
  collectEvidence,
  isCheckCommand,
  isWriteCommand,
  ruleVerdict,
} from '../src/features/stop-check/evidence.ts';

let nextId = 0;

function call(
  tool: string,
  input: Record<string, unknown>,
  failed = false,
  options: { outcomeUnknown?: true; text?: string } = {},
): Message[] {
  const id = `t${++nextId}`;
  const use: ToolUse = {
    tool_use_id: id,
    tool,
    input,
    ...(options.outcomeUnknown ? { outcomeUnknown: true } : {}),
  };
  return [
    { role: 'assistant', text: '', toolUses: [use] },
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [
        { tool_use_id: id, text: options.text ?? (failed ? 'exit 1' : 'ok'), isError: failed },
      ],
    },
  ];
}

function unknownCall(command: string): Message[] {
  const id = `t${++nextId}`;
  return [
    {
      role: 'assistant',
      text: '',
      toolUses: [{ tool_use_id: id, tool: 'Bash', input: { command }, outcomeUnknown: true }],
    },
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: id, text: 'output', isError: false }],
    },
  ];
}

function turn(...steps: Message[][]): Message[] {
  return [
    { role: 'user', text: 'earlier prompt', toolUses: [] },
    ...call('Edit', { file_path: 'old.ts' }),
    { role: 'user', text: 'fix the parser', toolUses: [] },
    ...steps.flat(),
  ];
}

function asker(answers: Record<string, number>): Asker & { asked: Record<string, Question>[] } {
  const asked: Record<string, Question>[] = [];
  const ask = (async (_state, questions) => {
    asked.push(questions);
    return {
      answers: Object.fromEntries(
        Object.keys(questions).map((name) => [name, { type: 'noul', noul: answers[name] ?? 0 }]),
      ),
      inputTokens: 100,
      requests: 1,
    };
  }) as Asker & { asked: Record<string, Question>[] };
  ask.asked = asked;
  return ask;
}

describe('isCheckCommand', () => {
  it.each(['pnpm test', 'make ci', 'cargo clippy -- -D warnings', 'npx vitest run', 'tsc -p .'])(
    'recognises %s',
    (command) => expect(isCheckCommand(command)).toBe(true),
  );

  it.each(['ls -la', 'git status', 'cat package.json', 'echo testing'])('ignores %s', (command) =>
    expect(isCheckCommand(command)).toBe(false),
  );
});

describe('collectEvidence', () => {
  it('reads only the last turn and orders checks against the last edit', () => {
    const evidence = collectEvidence(
      turn(
        call('Bash', { command: 'pnpm test' }, true),
        call('Edit', { file_path: 'parser.ts' }),
        call('Bash', { command: 'pnpm test' }),
      ),
    );
    expect(evidence.request).toBe('fix the parser');
    expect(evidence.editedFiles).toEqual(['parser.ts']);
    expect(evidence.checks).toEqual([
      { command: 'pnpm test', passed: false, afterLastEdit: false, output: 'exit 1' },
      { command: 'pnpm test', passed: true, afterLastEdit: true, output: 'ok' },
    ]);
  });
});

describe('ruleVerdict', () => {
  const verdict = (...steps: Message[][]) => ruleVerdict(collectEvidence(turn(...steps)));

  it('has nothing to check when no file was edited', () => {
    expect(verdict(call('Bash', { command: 'pnpm test' }, true))).toBe('nothing_to_check');
  });

  it('is unverified when the only check ran before the last edit', () => {
    expect(
      verdict(call('Bash', { command: 'pnpm test' }), call('Edit', { file_path: 'a.ts' })),
    ).toBe('unverified');
  });

  it('follows the newest check after the last edit', () => {
    const edit = call('Edit', { file_path: 'a.ts' });
    expect(verdict(edit, call('Bash', { command: 'pnpm test' }, true))).toBe('failing_check');
    expect(
      verdict(
        edit,
        call('Bash', { command: 'pnpm test' }, true),
        call('Bash', { command: 'pnpm test' }),
      ),
    ).toBe('verified');
  });
});

describe('checkStop', () => {
  it('flags a failing check by rule without asking the model', async () => {
    const ask = asker({});
    const result = await checkStop(
      turn(call('Edit', { file_path: 'a.ts' }), call('Bash', { command: 'pnpm test' }, true)),
      'All done.',
      ask,
    );
    expect(ask.asked).toHaveLength(0);
    expect(result.findings.map((finding) => [finding.code, finding.source])).toEqual([
      ['failing_check', 'rule'],
    ]);
  });

  it('asks nothing about a turn that did no work', async () => {
    const ask = asker({ states_unfinished: 1 });
    const result = await checkStop(
      turn(call('Read', { file_path: 'a.ts' })),
      'It parses JSON.',
      ask,
    );
    expect(ask.asked).toHaveLength(0);
    expect(result).toMatchObject({ verdict: 'nothing_to_check', asked: false, findings: [] });
  });

  it('flags an unverified claim only above the threshold', async () => {
    const messages = turn(call('Edit', { file_path: 'a.ts' }));
    const flagged = await checkStop(
      messages,
      'Fixed, it works now.',
      asker({ claims_success: 0.9 }),
    );
    expect(flagged.findings.map((finding) => finding.code)).toEqual(['unverified_claim']);
    expect(flagged.probabilities.claimsSuccess).toBe(0.9);

    const quiet = await checkStop(messages, 'Edited, not run yet.', asker({ claims_success: 0.2 }));
    expect(quiet.findings).toEqual([]);
  });

  it('does not ask whether a verified turn claims success', async () => {
    const ask = asker({ states_unfinished: 0.95, needs_user: 0.1 });
    const result = await checkStop(
      turn(call('Edit', { file_path: 'a.ts' }), call('Bash', { command: 'pnpm test' })),
      'Tests pass. Want me to do the other two files?',
      ask,
    );
    expect(Object.keys(ask.asked[0] ?? {})).toEqual(['states_unfinished', 'needs_user']);
    expect(result.findings.map((finding) => finding.code)).toEqual(['unfinished']);
  });

  it('does not flag unfinished work when the reply is waiting on the person', async () => {
    const messages = turn(
      call('Edit', { file_path: 'a.ts' }),
      call('Bash', { command: 'pnpm test' }),
    );
    const waiting = await checkStop(
      messages,
      'Half is done. The rest deletes the old table: do you want that?',
      asker({ states_unfinished: 0.95, needs_user: 0.9 }),
    );
    expect(waiting.findings).toEqual([]);
    expect(waiting.probabilities).toEqual({ statesUnfinished: 0.95, needsUser: 0.9 });

    const unanswered = await checkStop(
      messages,
      'Half is done.',
      asker({ states_unfinished: 0.95 }),
    );
    expect(unanswered.findings.map((finding) => finding.code)).toEqual(['unfinished']);
  });

  it('redacts credentials from the state it sends', async () => {
    let sent = '';
    const ask: Asker = async (state) => {
      sent = JSON.stringify(state);
      return { answers: {}, inputTokens: 0, requests: 1 };
    };
    const result = await checkStop(
      turn(call('Edit', { file_path: 'a.ts' })),
      'Set the key to sk-abcdefghijklmnopqrstuvwxyz0123 and it works.',
      ask,
    );
    expect(sent).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
    expect(result.redactions).toBe(1);
    expect(result.findings).toEqual([]);
  });
});

describe('shell commands that write', () => {
  it.each([
    "sed -i 's/a/b/' src/x.ts",
    'cd repo && sed -E -i s/a/b/ x',
    'cat > notes.md <<EOF',
    'echo done >> log.txt',
    'python3 gen.py | tee out.json',
    'mv a.ts b.ts',
    'git apply fix.patch',
    'make build && cp dist/a.js lib/',
  ])('counts %s as a write', (command) => {
    expect(isWriteCommand(command)).toBe(true);
  });

  it.each([
    'ls -la src',
    'grep -rn "a > b" src',
    'git status --short',
    'make test 2>&1 | tail -5',
    'cat file.txt > /dev/null',
    'node -e "console.log(1 >= 0)"',
    'git log --oneline | head',
    'curl -s https://example.com 2>/dev/null',
  ])('does not count %s as a write', (command) => {
    expect(isWriteCommand(command)).toBe(false);
  });

  const verdictOf = (...steps: Message[][]): string => ruleVerdict(collectEvidence(turn(...steps)));

  it('makes a turn that only edits through the shell unverified', () => {
    expect(verdictOf(call('Bash', { command: "sed -i 's/a/b/' src/x.ts" }))).toBe('unverified');
  });

  it('keeps a turn of read-only commands at nothing to check', () => {
    expect(
      verdictOf(call('Bash', { command: 'git status' }), call('Bash', { command: 'ls' })),
    ).toBe('nothing_to_check');
  });

  it('treats one command that writes then checks as checked', () => {
    expect(verdictOf(call('Bash', { command: "sed -i 's/a/b/' x.ts && make test" }))).toBe(
      'verified',
    );
    expect(verdictOf(call('Bash', { command: "sed -i 's/a/b/' x.ts && make test" }, true))).toBe(
      'failing_check',
    );
  });

  it('needs a check after the last shell write', () => {
    expect(
      verdictOf(
        call('Bash', { command: 'make test' }),
        call('Bash', { command: 'echo x >> a.ts' }),
      ),
    ).toBe('unverified');
  });
});

describe('a check with no reported outcome', () => {
  const afterEdit = () => turn(call('Edit', { file_path: 'a.ts' }), unknownCall('node --test'));

  it('has passed null and the verdict unknown', () => {
    const evidence = collectEvidence(afterEdit());
    expect(evidence.checks).toEqual([
      { command: 'node --test', passed: null, afterLastEdit: true, output: 'output' },
    ]);
    expect(ruleVerdict(evidence)).toBe('unknown');
  });

  it('is unverified again when an edit follows it', () => {
    expect(
      ruleVerdict(
        collectEvidence(turn(unknownCall('node --test'), call('Edit', { file_path: 'a.ts' }))),
      ),
    ).toBe('unverified');
  });

  it('asks whether the check failed, not whether the reply claims success', async () => {
    const ask = asker({ check_failed: 0.5 });
    const result = await checkStop(afterEdit(), 'done', ask);
    expect(result.verdict).toBe('unknown');
    expect(result.findings).toEqual([]);
    expect(Object.keys(ask.asked[0] ?? {}).sort()).toEqual([
      'check_failed',
      'needs_user',
      'states_unfinished',
    ]);
  });

  it('passes null through to the model state', async () => {
    let state: { run_facts: { checks_run: { passed: unknown }[] } } | undefined;
    const ask: Asker = async (given) => {
      state = given as typeof state;
      return { answers: {}, inputTokens: 0, requests: 1 };
    };
    await checkStop(afterEdit(), 'done', ask);
    expect(state?.run_facts.checks_run[0]?.passed).toBeNull();
  });
});

describe('settling an unknown outcome from the check output', () => {
  const unknownTurn = (text = 'FAIL 2 tests') =>
    turn(
      call('Edit', { file_path: 'a.ts' }),
      call('Bash', { command: 'node --test' }, false, { outcomeUnknown: true, text }),
    );

  it('flags a failing check when the model reads the output as a failure', async () => {
    const ask = asker({ check_failed: 0.95 });
    const result = await checkStop(unknownTurn(), 'All done.', ask);
    expect(result.verdict).toBe('failing_check');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'failing_check',
      source: 'model',
      probability: 0.95,
    });
    expect(result.findings[0]?.message).toContain('node --test');
    expect(result.probabilities.checkFailed).toBe(0.95);
    expect(Object.keys(ask.asked[0] ?? {})).toContain('check_failed');
    expect(Object.keys(ask.asked[0] ?? {})).not.toContain('claims_success');
  });

  it('is verified when the model reads the output as a pass', async () => {
    const result = await checkStop(unknownTurn('ok'), 'All done.', asker({ check_failed: 0.05 }));
    expect(result.verdict).toBe('verified');
    expect(result.findings).toEqual([]);
  });

  it('stays unknown between the thresholds', async () => {
    const result = await checkStop(unknownTurn(), 'All done.', asker({ check_failed: 0.5 }));
    expect(result.verdict).toBe('unknown');
    expect(result.findings).toEqual([]);
  });

  it('stays unknown when the answer is missing', async () => {
    const ask: Asker = async () => ({ answers: {}, inputTokens: 0, requests: 1 });
    const result = await checkStop(unknownTurn(), 'All done.', ask);
    expect(result.verdict).toBe('unknown');
    expect(result.findings).toEqual([]);
  });

  it('still reports unfinished work alongside the outcome', async () => {
    const result = await checkStop(
      unknownTurn(),
      'Half done.',
      asker({ check_failed: 0.95, states_unfinished: 0.9 }),
    );
    expect(result.findings.map((finding) => finding.code)).toEqual(['failing_check', 'unfinished']);
  });

  async function stateFor(messages: Message[]): Promise<Record<string, unknown>> {
    let state: Record<string, unknown> = {};
    const ask: Asker = async (given) => {
      state = given as Record<string, unknown>;
      return { answers: {}, inputTokens: 0, requests: 1 };
    };
    await checkStop(messages, 'done', ask);
    return state;
  }

  it('sends the output and command, between run_facts and user_request', async () => {
    const state = await stateFor(unknownTurn('3 failed, 10 passed'));
    expect(state.check_output).toBe('3 failed, 10 passed');
    expect(state.check_command).toBe('node --test');
    expect(Object.keys(state)).toEqual([
      'final_message',
      'run_facts',
      'check_output',
      'check_command',
      'user_request',
    ]);
  });

  it('sends no output for an unverified turn or a known outcome', async () => {
    expect(await stateFor(turn(call('Edit', { file_path: 'a.ts' })))).not.toHaveProperty(
      'check_output',
    );
    expect(
      await stateFor(
        turn(call('Edit', { file_path: 'a.ts' }), call('Bash', { command: 'pnpm test' })),
      ),
    ).not.toHaveProperty('check_output');
  });

  it('redacts credentials in the output', async () => {
    const state = await stateFor(
      unknownTurn('using key sk-abcdefghijklmnopqrstuvwxyz012345 failed'),
    );
    expect(JSON.stringify(state)).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
  });
});

describe('evidence output', () => {
  it('carries each check output, falling back to the tool use text', () => {
    const id = 'direct';
    const messages: Message[] = [
      ...turn(call('Bash', { command: 'pnpm test' }, false, { text: 'first run' })),
      {
        role: 'assistant',
        text: '',
        toolUses: [
          { tool_use_id: id, tool: 'Bash', input: { command: 'pnpm lint' }, text: 'inline' },
        ],
      },
    ];
    expect(collectEvidence(messages).checks.map((check) => check.output)).toEqual([
      'first run',
      'inline',
    ]);
  });
});

describe('outputExcerpt', () => {
  it('leaves short text unchanged', () => {
    expect(outputExcerpt('short', 100)).toBe('short');
  });

  it('keeps the start and the end of long text within the limit plus the note', () => {
    const text = `START${'x'.repeat(5000)}END`;
    const excerpt = outputExcerpt(text, 400);
    expect(excerpt.startsWith('START')).toBe(true);
    expect(excerpt.endsWith('END')).toBe(true);
    expect(excerpt).toContain('chars omitted');
    expect(excerpt.length).toBeLessThanOrEqual(400 + 40);
  });
});
