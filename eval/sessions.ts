import type { Message, ToolResult, ToolUse } from '../src/core/transcript.ts';

/** One finished turn: the history up to its last reply, as the stop check sees it. */
export type Turn = {
  index: number;
  prompt: string;
  answer: string;
  messages: Message[];
};

type Block = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};

type Line = {
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  message?: { role?: string; content?: unknown };
};

const NOT_A_PROMPT = /^\s*<(local-command-|command-name>)/;

function blockText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as Block[])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function toMessage(line: Line): Message | undefined {
  const role = line.message?.role;
  if (role !== 'user' && role !== 'assistant') return undefined;
  const content = line.message?.content;
  const blocks: Block[] = Array.isArray(content) ? (content as Block[]) : [];
  const toolUses: ToolUse[] = [];
  const toolResults: ToolResult[] = [];
  for (const block of blocks) {
    if (block.type === 'tool_use' && typeof block.id === 'string') {
      toolUses.push({
        tool_use_id: block.id,
        tool: block.name ?? '',
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
    if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
      toolResults.push({
        tool_use_id: block.tool_use_id,
        text: blockText(block.content),
        isError: block.is_error === true,
      });
    }
  }
  const message: Message = { role, text: blockText(content), toolUses };
  if (toolResults.length > 0) message.toolResults = toolResults;
  return message;
}

function isPrompt(message: Message): boolean {
  return message.role === 'user' && message.text.trim() !== '' && !message.toolResults?.length;
}

/**
 * Splits a Claude Code session file into finished turns. A turn counts when it
 * ends on a reply with text and no tool call left open; subagent lines, meta
 * lines, slash commands and compaction summaries are left out.
 */
export function parseSession(text: string): Turn[] {
  const messages: Message[] = [];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    let line: Line;
    try {
      line = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    if (line.type !== 'user' && line.type !== 'assistant') continue;
    if (line.isSidechain === true || line.isMeta === true || line.isCompactSummary === true) {
      continue;
    }
    const message = toMessage(line);
    if (message?.role === 'user' && !message.toolResults && NOT_A_PROMPT.test(message.text)) {
      continue;
    }
    if (
      message &&
      (message.text.trim() !== '' || message.toolUses.length > 0 || message.toolResults)
    ) {
      messages.push(message);
    }
  }

  const turns: Turn[] = [];
  const starts = messages.flatMap((message, at) => (isPrompt(message) ? [at] : []));
  for (const [n, start] of starts.entries()) {
    const end = (starts[n + 1] ?? messages.length) - 1;
    const last = messages[end];
    if (end <= start || last?.role !== 'assistant' || last.text.trim() === '') continue;
    if (last.toolUses.length > 0) continue;
    turns.push({
      index: turns.length,
      prompt: messages[start]?.text ?? '',
      answer: last.text,
      messages: messages.slice(0, end + 1),
    });
  }
  return turns;
}
