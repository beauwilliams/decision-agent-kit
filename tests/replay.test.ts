import { describe, expect, it } from 'vitest';

import { report, type Row } from '../eval/report.ts';
import { parseSession } from '../eval/sessions.ts';

function line(type: 'user' | 'assistant', content: unknown, extra: object = {}): string {
  return JSON.stringify({ type, message: { role: type, content }, ...extra });
}

const SESSION = [
  JSON.stringify({ type: 'attachment' }),
  line('user', 'Fix add.js'),
  line('assistant', [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'add.js' } }]),
  line('user', [
    { type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'ok' }] },
  ]),
  line('assistant', [{ type: 'text', text: 'Fixed.' }]),
  line('user', '<command-name>/model</command-name>'),
  line('user', 'A subagent line', { isSidechain: true }),
  line('user', 'Summary of earlier work', { isCompactSummary: true }),
  line('user', 'What is 2 + 2?'),
  line('assistant', [{ type: 'text', text: '4' }]),
  line('user', 'Run the tests'),
  line('assistant', [
    { type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'make test' } },
  ]),
  'not json',
].join('\n');

describe('parseSession', () => {
  const turns = parseSession(SESSION);

  it('finds each finished turn and leaves out the one cut short', () => {
    expect(turns.map((turn) => [turn.prompt, turn.answer])).toEqual([
      ['Fix add.js', 'Fixed.'],
      ['What is 2 + 2?', '4'],
    ]);
  });

  it('gives a turn the history up to its reply, with tool calls and results', () => {
    const first = turns[0];
    expect(first?.messages).toHaveLength(4);
    expect(first?.messages[1]?.toolUses[0]).toMatchObject({ tool: 'Edit', tool_use_id: 't1' });
    expect(first?.messages[2]?.toolResults?.[0]).toEqual({
      tool_use_id: 't1',
      text: 'ok',
      isError: false,
    });
  });

  it('does not treat a slash command, a subagent line or a summary as a prompt', () => {
    expect(turns[1]?.messages.some((message) => message.text.includes('command-name'))).toBe(false);
    expect(turns.some((turn) => turn.prompt.includes('subagent'))).toBe(false);
    expect(turns.some((turn) => turn.prompt.includes('Summary'))).toBe(false);
  });
});

describe('report', () => {
  const base: Row = {
    session: 's',
    project: 'p',
    turn: 0,
    verdict: 'unverified',
    wouldAsk: true,
    sent: true,
    ruleFinding: false,
    toolCalls: 3,
    filesEdited: 1,
    checksRun: 0,
    inputTokens: 100,
    prompt: '',
    answer: '',
  };
  const rows: Row[] = [
    { ...base, turn: 0, statesUnfinished: 0.95, needsUser: 0.1, claimsSuccess: 0.9 },
    { ...base, turn: 1, statesUnfinished: 0.65, needsUser: 0.2, claimsSuccess: 0.2 },
    { ...base, turn: 3, statesUnfinished: 0.99, needsUser: 0.8 },
    { ...base, turn: 2, verdict: 'nothing_to_check', wouldAsk: false, sent: false, inputTokens: 0 },
  ];

  it('counts verdicts and what was sent', () => {
    const text = report(rows);
    expect(text).toContain('4 turns from 1 sessions in 1 projects');
    expect(text).toContain('unverified: 3 (75%)');
    expect(text).toContain('sent: 3, input tokens: 300');
  });

  it('counts false alarms and misses at each threshold when labels exist', () => {
    const text = report(rows, [
      { session: 's', turn: 0, needlessStop: false, claims: true },
      { session: 's', turn: 1, needlessStop: true, claims: false },
      { session: 's', turn: 3, needlessStop: false },
    ]);
    expect(text).toContain('unfinished: 3 turns scored, 3 labelled');
    expect(text).toContain('at 0.7: 1 flagged (33%); false alarms 1/2, misses 1/1');
    expect(text).toContain('at 0.6: 2 flagged (67%); false alarms 1/2, misses 0/1');
    expect(text).toMatch(
      /unverified_claim: 2 turns scored, 2 labelled\n {2}at 0\.5: 1 flagged \(50%\); false alarms 0\/1, misses 0\/1/,
    );
  });
});
