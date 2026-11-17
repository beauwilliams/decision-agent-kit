export type ToolUse = {
  tool_use_id: string;
  tool: string;
  input: Record<string, unknown>;
  text?: string;
  isError?: true;
  /** The harness reports a command's output but not whether it succeeded. */
  outcomeUnknown?: true;
};

export type ToolResult = {
  tool_use_id: string;
  text: string;
  isError: boolean;
};

export type Message = {
  role: 'user' | 'assistant';
  text: string;
  toolUses: ToolUse[];
  toolResults?: ToolResult[];
};

export type Call = {
  /** Short label the model sees and answers by: c1, c2, ... */
  id: string;
  toolUseId: string;
  tool: string;
  input: Record<string, unknown>;
  inputJson: string;
  result: string;
  isError: boolean;
  messageIndex: number;
  pinned: boolean;
};

export function inputJson(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input) ?? '{}';
  } catch {
    return '{}';
  }
}

/**
 * Every answered tool call, oldest first. A call with no result yet is left
 * out: there is nothing to decide about it. Calls in the first message or in
 * the newest `preserveRecent` messages are pinned.
 */
export function collectCalls(messages: readonly Message[], preserveRecent: number): Call[] {
  const results = new Map<string, ToolResult>();
  for (const message of messages) {
    for (const result of message.toolResults ?? []) results.set(result.tool_use_id, result);
  }
  const firstPinned = messages.length - preserveRecent;
  const calls: Call[] = [];
  messages.forEach((message, messageIndex) => {
    for (const use of message.toolUses) {
      const result = results.get(use.tool_use_id);
      const text = result?.text ?? use.text;
      if (text === undefined) continue;
      calls.push({
        id: `c${calls.length + 1}`,
        toolUseId: use.tool_use_id,
        tool: use.tool,
        input: use.input,
        inputJson: inputJson(use.input),
        result: text,
        isError: result?.isError ?? use.isError ?? false,
        messageIndex,
        pinned: messageIndex === 0 || messageIndex >= firstPinned,
      });
    }
  });
  return calls;
}

/**
 * Characters of text, tool input and tool output in a transcript. A result
 * the transcript holds twice (on the tool use and as a tool result) counts once.
 */
export function transcriptChars(messages: readonly Message[]): number {
  let total = 0;
  const results = new Map<string, number>();
  for (const message of messages) {
    total += message.text.length;
    for (const use of message.toolUses) {
      total += inputJson(use.input).length;
      if (use.text !== undefined && !results.has(use.tool_use_id)) {
        results.set(use.tool_use_id, use.text.length);
      }
    }
    for (const result of message.toolResults ?? []) {
      results.set(result.tool_use_id, result.text.length);
    }
  }
  for (const chars of results.values()) total += chars;
  return total;
}

/** Head and tail of a long text around a note saying how much was left out. */
export function abridge(text: string, limit: number): string {
  if (text.length <= limit) return text;
  if (limit <= 0) return `[${text.length} chars omitted]`;
  const head = Math.ceil(limit * 0.6);
  const tail = limit - head;
  const omitted = text.length - head - tail;
  return `${text.slice(0, head)}\n[... ${omitted} chars omitted ...]\n${tail > 0 ? text.slice(-tail) : ''}`;
}
