import { describe, expect, it } from 'vitest';

import { abridge, collectCalls, transcriptChars, type Message } from '../src/core/transcript.ts';

const messages: Message[] = [
  { role: 'user', text: 'fix it', toolUses: [] },
  {
    role: 'assistant',
    text: '',
    toolUses: [
      { tool_use_id: 'a', tool: 'Read', input: { file_path: 'x.ts' }, text: 'AAAA' },
      { tool_use_id: 'b', tool: 'Bash', input: { command: 'ls' } },
    ],
  },
  {
    role: 'user',
    text: '',
    toolUses: [],
    toolResults: [{ tool_use_id: 'a', text: 'AAAA', isError: false }],
  },
  { role: 'assistant', text: 'done', toolUses: [] },
];

describe('collectCalls', () => {
  it('pairs each use with its result and skips a call still in flight', () => {
    const calls = collectCalls(messages, 1);
    expect(calls.map((call) => [call.id, call.toolUseId, call.result, call.pinned])).toEqual([
      ['c1', 'a', 'AAAA', false],
    ]);
  });

  it('pins calls inside the recent window', () => {
    expect(collectCalls(messages, 3)[0]?.pinned).toBe(true);
  });
});

describe('transcriptChars', () => {
  it('counts a result held on both the use and the result once', () => {
    const inputs = '{"file_path":"x.ts"}'.length + '{"command":"ls"}'.length;
    expect(transcriptChars(messages)).toBe('fix it'.length + 'done'.length + inputs + 4);
  });
});

describe('abridge', () => {
  it('keeps a head and a tail and says how much it left out', () => {
    const out = abridge('a'.repeat(50) + 'b'.repeat(50), 20);
    expect(out.startsWith('a'.repeat(12))).toBe(true);
    expect(out.endsWith('b'.repeat(8))).toBe(true);
    expect(out).toContain('80 chars omitted');
  });

  it('returns short text unchanged', () => {
    expect(abridge('short', 20)).toBe('short');
  });
});
