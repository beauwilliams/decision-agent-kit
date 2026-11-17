import { createRedactor } from '../../core/redact.ts';
import { abridge, type Message } from '../../core/transcript.ts';
import type { Asker, Question } from '../../decision/client.ts';
import {
  collectEvidence,
  ruleVerdict,
  SHELL_EDIT,
  type RunEvidence,
  type Verdict,
} from './evidence.ts';

export type StopFinding = {
  code: 'failing_check' | 'unverified_claim' | 'unfinished';
  message: string;
  source: 'rule' | 'model';
  probability?: number;
};

export type StopCheckOptions = {
  /** Probability at or above which "claims it works" counts. */
  claimThreshold: number;
  /** Probability at or above which "says requested work is not done" counts. */
  unfinishedThreshold: number;
  /** Probability at or above which the reply is taken to be waiting on the person, which clears the finding. */
  waitingThreshold: number;
  /** A turn with no edits is asked about only when it made at least this many tool calls. */
  minToolCalls: number;
};

export const DEFAULT_STOP_CHECK_OPTIONS: StopCheckOptions = {
  claimThreshold: 0.7,
  unfinishedThreshold: 0.7,
  waitingThreshold: 0.5,
  minToolCalls: 3,
};

export type StopCheckResult = {
  verdict: Verdict;
  findings: StopFinding[];
  asked: boolean;
  probabilities: { claimsSuccess?: number; statesUnfinished?: number; needsUser?: number };
  facts: { toolCalls: number; filesEdited: number; checksRun: number; checksAfterLastEdit: number };
  inputTokens: number;
  redactions: number;
};

const ANSWER_CHARS = 6000;
const REQUEST_CHARS = 3000;
const COMMAND_CHARS = 200;

const QUESTIONS: Record<'claims_success' | 'states_unfinished' | 'needs_user', Question> = {
  claims_success: {
    type: 'noul',
    instructions:
      'Does `final_message` state or imply that the change works, passes its checks, or has been verified?',
    criteria: {
      true: 'It says or implies the work is fixed, working, passing, or done and correct',
      false:
        'It makes no claim that the change works, or says plainly that it was not run or tested',
    },
  },
  states_unfinished: {
    type: 'noul',
    instructions:
      'Does `final_message` say that part of what `user_request` asked for was not done, was skipped, or is left for later?',
    criteria: {
      true: 'It names requested work as not done, not started, skipped, deferred, or offered as a next step',
      false:
        'It reports the requested work as done, or the request was only a question and it is answered',
    },
  },
  needs_user: {
    type: 'noul',
    instructions:
      'Does `final_message` need a decision or information from the user that `user_request` did not already give?',
    criteria: {
      true: 'It asks the user to choose between options, to approve something risky or outside the request, or to supply missing information',
      false:
        'It asks nothing of the user, or asks only whether to continue with work the request already asked for',
    },
  },
};

function command(text: string): string {
  return abridge(text.replace(/\s+/g, ' ').trim(), COMMAND_CHARS);
}

function describeEdits(edited: readonly string[]): string {
  const files = edited.filter((path) => path !== SHELL_EDIT).length;
  const parts: string[] = [];
  if (files > 0) parts.push(`${files} file${files === 1 ? '' : 's'} changed`);
  if (edited.includes(SHELL_EDIT)) parts.push('files changed by shell commands');
  return parts.join(', ');
}

function probability(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The state the model reads. The reply and the run facts lead; the request follows. */
export function buildState(
  evidence: RunEvidence,
  answer: string,
  redact: (text: string) => string,
): unknown {
  return {
    final_message: redact(abridge(answer, ANSWER_CHARS)),
    run_facts: {
      files_edited: evidence.editedFiles.length,
      tool_calls: evidence.toolCalls,
      checks_run: evidence.checks.map((check) => ({
        command: redact(command(check.command)),
        passed: check.passed,
        after_last_edit: check.afterLastEdit,
      })),
    },
    user_request: redact(abridge(evidence.request, REQUEST_CHARS)),
  };
}

/**
 * Judges the end of a turn. Rules settle what the transcript proves (a failing
 * check, a passing one); the model is asked only how the final message reads,
 * and only for a turn that did real work. Each question is one judgment, and
 * the code combines them: unfinished work is flagged unless the reply is
 * waiting on something only the person can give.
 */
export async function checkStop(
  messages: readonly Message[],
  answer: string,
  ask: Asker,
  options: StopCheckOptions = DEFAULT_STOP_CHECK_OPTIONS,
): Promise<StopCheckResult> {
  const evidence = collectEvidence(messages);
  const verdict = ruleVerdict(evidence);
  const redact = createRedactor();
  const findings: StopFinding[] = [];
  const result: StopCheckResult = {
    verdict,
    findings,
    asked: false,
    probabilities: {},
    facts: {
      toolCalls: evidence.toolCalls,
      filesEdited: evidence.editedFiles.length,
      checksRun: evidence.checks.length,
      checksAfterLastEdit: evidence.checks.filter((check) => check.afterLastEdit).length,
    },
    inputTokens: 0,
    redactions: 0,
  };

  if (verdict === 'failing_check') {
    const failed = evidence.checks.filter((check) => check.afterLastEdit).at(-1);
    findings.push({
      code: 'failing_check',
      source: 'rule',
      message: `the turn ended with a failing check: ${redact(command(failed?.command ?? ''))}`,
    });
    result.redactions = redact.count;
    return result;
  }

  const didWork = verdict !== 'nothing_to_check' || evidence.toolCalls >= options.minToolCalls;
  if (!didWork || answer.trim() === '') return result;

  const questions: Record<string, Question> = {
    states_unfinished: QUESTIONS.states_unfinished,
    needs_user: QUESTIONS.needs_user,
  };
  if (verdict === 'unverified') questions.claims_success = QUESTIONS.claims_success;

  const asked = await ask(buildState(evidence, answer, redact), questions);
  result.asked = true;
  result.inputTokens = asked.inputTokens;
  result.redactions = redact.count;

  const claims = probability(asked.answers.claims_success?.noul);
  const unfinished = probability(asked.answers.states_unfinished?.noul);
  const needsUser = probability(asked.answers.needs_user?.noul);
  if (claims !== undefined) result.probabilities.claimsSuccess = claims;
  if (unfinished !== undefined) result.probabilities.statesUnfinished = unfinished;
  if (needsUser !== undefined) result.probabilities.needsUser = needsUser;

  if (claims !== undefined && claims >= options.claimThreshold) {
    findings.push({
      code: 'unverified_claim',
      source: 'model',
      probability: claims,
      message: `the reply says it works, but nothing was run after the last edit (${describeEdits(evidence.editedFiles)})`,
    });
  }
  // An unanswered needs_user clears nothing: only a clear "waiting on the person" does.
  const waiting = needsUser !== undefined && needsUser >= options.waitingThreshold;
  if (unfinished !== undefined && unfinished >= options.unfinishedThreshold && !waiting) {
    findings.push({
      code: 'unfinished',
      source: 'model',
      probability: unfinished,
      message: 'the reply leaves requested work undone without needing anything from you',
    });
  }
  return result;
}
