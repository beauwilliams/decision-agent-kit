import type { Message, ToolUse } from '../src/core/transcript.ts';

type Common = {
  session_id: string;
  turn_id: string;
  cwd?: string;
  model?: string;
};

export type UserPromptSubmitEvent = Common & {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
};

export type PostToolUseEvent = Common & {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
};

export type StopEvent = Common & {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
  last_assistant_message?: string | null;
};

export type CodexEvent = UserPromptSubmitEvent | PostToolUseEvent | StopEvent;

const PATCH_PATH = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;

/** Paths a patch names, in order, each once. */
export function patchFiles(patch: string): string[] {
  const paths = new Set<string>();
  for (const match of patch.matchAll(PATCH_PATH)) {
    const path = match[1]?.trim();
    if (path) paths.add(path);
  }
  return [...paths];
}

function responseText(response: unknown): string {
  if (typeof response === 'string') return response;
  try {
    return JSON.stringify(response) ?? '';
  } catch {
    return '';
  }
}

function toolUses(event: PostToolUseEvent): ToolUse[] {
  const input = event.tool_input ?? {};
  if (event.tool_name === 'Bash') {
    return [{ tool_use_id: event.tool_use_id, tool: 'Bash', input, outcomeUnknown: true }];
  }
  if (event.tool_name === 'apply_patch') {
    const patch = typeof input.command === 'string' ? input.command : '';
    const files = patchFiles(patch);
    if (files.length === 0) {
      return [{ tool_use_id: `${event.tool_use_id}#0`, tool: 'Edit', input: {} }];
    }
    return files.map((file, index) => ({
      tool_use_id: `${event.tool_use_id}#${index}`,
      tool: 'Edit',
      input: { file_path: file },
    }));
  }
  return [{ tool_use_id: event.tool_use_id, tool: event.tool_name, input }];
}

/**
 * The transcript of the turn the Stop event ends. Events from other turns are
 * ignored; with no Stop event the newest event's turn is used.
 */
export function turnMessages(events: readonly CodexEvent[]): Message[] {
  const stop = events.findLast((event) => event.hook_event_name === 'Stop');
  const turnId = (stop ?? events.at(-1))?.turn_id;
  const messages: Message[] = [];
  for (const event of events) {
    if (event.turn_id !== turnId) continue;
    if (event.hook_event_name === 'UserPromptSubmit') {
      messages.push({ role: 'user', text: event.prompt, toolUses: [] });
    } else if (event.hook_event_name === 'PostToolUse') {
      const uses = toolUses(event);
      const text = responseText(event.tool_response);
      messages.push(
        { role: 'assistant', text: '', toolUses: uses },
        {
          role: 'user',
          text: '',
          toolUses: [],
          toolResults: uses.map((use) => ({ tool_use_id: use.tool_use_id, text, isError: false })),
        },
      );
    }
  }
  return messages;
}
