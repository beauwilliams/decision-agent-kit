import { describe, expect, it } from 'vitest';

import type { Message, ToolUse } from '../src/core/transcript.ts';
import type { Asker, Question } from '../src/subq/client.ts';
import { checkStop } from '../src/features/stop-check/check.ts';
import {
  collectEvidence,
  isCheckCommand,
  ruleVerdict,
} from '../src/features/stop-check/evidence.ts';

let nextId = 0;

function call(tool: string, input: Record<string, unknown>, failed = false): Message[] {
  const id = `t${++nextId}`;
  const use: ToolUse = { tool_use_id: id, tool, input };
  return [
    { role: 'assistant', text: '', toolUses: [use] },
    {
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: id, text: failed ? 'exit 1' : 'ok', isError: failed }],
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
      { command: 'pnpm test', passed: false, afterLastEdit: false },
      { command: 'pnpm test', passed: true, afterLastEdit: true },
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
    const ask = asker({ unfinished: 1 });
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
    const ask = asker({ unfinished: 0.95 });
    const result = await checkStop(
      turn(call('Edit', { file_path: 'a.ts' }), call('Bash', { command: 'pnpm test' })),
      'Tests pass. Want me to do the other two files?',
      ask,
    );
    expect(Object.keys(ask.asked[0] ?? {})).toEqual(['unfinished']);
    expect(result.findings.map((finding) => finding.code)).toEqual(['unfinished']);
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
