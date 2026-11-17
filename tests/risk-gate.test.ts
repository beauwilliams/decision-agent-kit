import { describe, expect, it } from 'vitest';

import type { Asker, Question } from '../src/decision/client.ts';
import {
  DEFAULT_GATE_OPTIONS,
  isReadOnlyCommand,
  judgeCommand,
  shouldPrompt,
  type GateContext,
} from '../src/features/risk-gate/gate.ts';

const CONTEXT: GateContext = {
  command: 'rm -rf build',
  intent: 'cleaning up',
  request: 'fix the build',
};

type Call = { state: unknown; questions: Record<string, Question> };

function fakeAsker(answers: Record<string, number | undefined>): { ask: Asker; calls: Call[] } {
  const calls: Call[] = [];
  const ask: Asker = async (state, questions) => {
    calls.push({ state, questions });
    return {
      answers: Object.fromEntries(
        Object.entries(answers).map(([id, noul]) => [id, noul === undefined ? {} : { noul }]),
      ),
      inputTokens: 9,
      requests: 1,
    };
  };
  return { ask, calls };
}

describe('isReadOnlyCommand', () => {
  it.each([
    'ls -la',
    'git status && git diff',
    'cd app && rg foo | head -5',
    'cat a.txt 2>&1',
    'echo hi',
    'FOO=1 git log --oneline',
    'grep -n "a > b" file',
    '',
  ])('is read-only: %j', (command) => {
    expect(isReadOnlyCommand(command)).toBe(true);
  });

  it.each([
    'rm -rf build',
    'git push --force',
    'ls > out.txt',
    'echo hi > f',
    'find . -delete',
    String.raw`find . -exec rm {} \;`,
    'cat $(which x)',
    'git status; make deploy',
    'sed -i s/a/b/ f',
    'git checkout -- .',
    'curl -X POST https://x',
  ])('is not read-only: %j', (command) => {
    expect(isReadOnlyCommand(command)).toBe(false);
  });
});

describe('judgeCommand', () => {
  it('makes no request for a read-only command', async () => {
    const { ask, calls } = fakeAsker({});
    const decision = await judgeCommand({ ...CONTEXT, command: 'git status' }, ask);
    expect(calls).toHaveLength(0);
    expect(decision).toMatchObject({ judged: false, prompt: false, inputTokens: 0 });
  });

  it('asks both questions in one request', async () => {
    const { ask, calls } = fakeAsker({ hard_to_undo: 0.9, outside_request: 0.8 });
    const decision = await judgeCommand(CONTEXT, ask);
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]?.questions ?? {}).sort()).toEqual([
      'hard_to_undo',
      'outside_request',
    ]);
    expect(decision.probabilities).toEqual({ hardToUndo: 0.9, outsideRequest: 0.8 });
    expect(decision.inputTokens).toBe(9);
  });

  it('prompts only when both answers reach their thresholds', async () => {
    const run = async (undo: number, outside: number) =>
      (await judgeCommand(CONTEXT, fakeAsker({ hard_to_undo: undo, outside_request: outside }).ask))
        .prompt;
    expect(await run(0.7, 0.5)).toBe(true);
    expect(await run(0.69, 0.9)).toBe(false);
    expect(await run(0.9, 0.49)).toBe(false);
  });

  it.each([
    [{ hard_to_undo: 0.9 }],
    [{ outside_request: 0.9 }],
    [{ hard_to_undo: 0.9, outside_request: Number.NaN }],
  ])('adds no prompt when an answer is missing: %j', async (answers) => {
    const decision = await judgeCommand(CONTEXT, fakeAsker(answers).ask);
    expect(decision.prompt).toBe(false);
    expect(shouldPrompt(decision.probabilities)).toBe(false);
  });

  it('sets the reason only when prompting', async () => {
    const yes = await judgeCommand(
      CONTEXT,
      fakeAsker({ hard_to_undo: 0.853, outside_request: 0.6 }).ask,
    );
    expect(yes.reason).toBe(
      'this command looks hard to undo and outside what was asked (0.85, 0.60)',
    );
    const no = await judgeCommand(
      CONTEXT,
      fakeAsker({ hard_to_undo: 0.1, outside_request: 0.9 }).ask,
    );
    expect(no.reason).toBeUndefined();
  });

  it('redacts credential-shaped text before it is sent', async () => {
    const { ask, calls } = fakeAsker({ hard_to_undo: 0, outside_request: 0 });
    const decision = await judgeCommand(
      {
        ...CONTEXT,
        command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz.0123456789" x',
      },
      ask,
    );
    expect(JSON.stringify(calls[0]?.state)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(decision.redactions).toBeGreaterThan(0);
  });

  it('lets a failed request throw', async () => {
    const ask: Asker = async () => {
      throw new Error('down');
    };
    await expect(judgeCommand(CONTEXT, ask)).rejects.toThrow('down');
  });

  it('uses the documented default thresholds', () => {
    expect(DEFAULT_GATE_OPTIONS).toEqual({ undoThreshold: 0.7, outsideThreshold: 0.5 });
  });
});

describe('earlier requests', () => {
  it("sends the session's earlier requests, oldest first, and asks about them", async () => {
    let state: Record<string, unknown> = {};
    let instructions = '';
    const ask: Asker = async (sent, questions) => {
      state = sent as Record<string, unknown>;
      instructions = questions.outside_request?.instructions ?? '';
      return { answers: {}, inputTokens: 0, requests: 1 };
    };
    await judgeCommand(
      {
        command: 'gh pr merge 3 --squash',
        intent: '',
        request: 'carry on',
        earlierRequests: ['you may merge your own pull requests', '  ', 'fix the parser'],
      },
      ask,
    );
    expect(state.earlier_requests).toEqual([
      'you may merge your own pull requests',
      'fix the parser',
    ]);
    expect(instructions).toContain('earlier_requests');
  });

  it('keeps the newest when there are too many to send', async () => {
    let sent: string[] = [];
    const ask: Asker = async (state) => {
      sent = (state as { earlier_requests: string[] }).earlier_requests;
      return { answers: {}, inputTokens: 0, requests: 1 };
    };
    const many = Array.from({ length: 80 }, (_, n) => `request ${n} ${'x'.repeat(390)}`);
    await judgeCommand(
      { command: 'rm -rf build', intent: '', request: '', earlierRequests: many },
      ask,
    );
    expect(sent.length).toBeLessThan(80);
    expect(sent.at(-1)).toContain('request 79 ');
    expect(sent.join('').length).toBeLessThanOrEqual(12_000);
  });
});
