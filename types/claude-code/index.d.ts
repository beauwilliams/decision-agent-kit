/**
 * The part of the Claude Code plugin API that hooks/register.ts uses, for
 * type-checking where Claude Code has not written its own declarations to
 * .claude-plugin/types/. Those take precedence when present.
 */
import type { Message } from '../../src/core/transcript.ts';

export type PluginOptions = Readonly<Record<string, string | number | boolean | readonly string[]>>;

export interface EngineInterface {
  env: { get(name: string): Promise<string | undefined> };
  process: {
    run(
      argv: readonly string[],
      options?: { timeoutMs?: number },
    ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
  session: {
    id(): Promise<string>;
    cwd(): Promise<string>;
    messages(): Promise<Message[]>;
  };
  fs: {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
  };
  http: {
    fetch(
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<{ status: number; ok: boolean; text: string }>;
  };
  clock: { sleep(ms: number): Promise<void> };
  ui: {
    toast(text: string, options?: { timeoutMs?: number }): void;
    log(text: string): void;
  };
  command: {
    register(command: { name: string; description: string; argumentHint?: string }): Promise<void>;
  };
}

type Next<E, R> = (event: E) => Promise<R>;
type Hook<E, R> = ($: EngineInterface, e: E, next: Next<E, R>) => Promise<R> | R;

type SessionStart = Record<string, unknown>;
type CommandRun = { command: string; args: string };
type CommandResult = { text?: string } | undefined;
type TurnComplete = { turnId: string; agentId?: string; reason: string; answer: string };
type TurnResult = { text?: string } | undefined;

export type On = {
  (event: 'session.start', hook: Hook<SessionStart, unknown>): void;
  (event: 'command.run', filter: { command: string }, hook: Hook<CommandRun, CommandResult>): void;
  (event: 'turn.complete', hook: Hook<TurnComplete, TurnResult>): void;
};

export type Register = (on: On, options: PluginOptions) => unknown;
