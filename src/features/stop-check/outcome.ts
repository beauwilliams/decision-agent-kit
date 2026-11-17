import type { Question } from '../../decision/client.ts';

const OUTPUT_CHARS = 4000;
const COMMAND_CHARS = 400;

export const CHECK_FAILED: Question = {
  type: 'noul',
  instructions:
    'Does `check_output` show that the command in `check_command` failed: a test failed, the build or type-check reported an error, or the linter reported a violation?',
  criteria: {
    true: 'The output reports at least one failing test, a compile or type error, a lint error, or the command stopped with an error',
    false:
      'The output reports success, or shows only passing results, warnings, or text with no failure in it',
  },
};

/** Failures are reported at the end of a run more often than the start, so the tail gets most of the room. */
export function outputExcerpt(output: string, limit: number = OUTPUT_CHARS): string {
  if (output.length <= limit) return output;
  const head = Math.floor(limit * 0.25);
  const tail = limit - head;
  return `${output.slice(0, head)}\n[... ${output.length - limit} chars omitted ...]\n${output.slice(-tail)}`;
}

export function outcomeState(
  command: string,
  output: string,
  redact: (text: string) => string,
): { check_output: string; check_command: string } {
  return {
    check_output: redact(outputExcerpt(output)),
    check_command: redact(command.replace(/\s+/g, ' ').trim().slice(0, COMMAND_CHARS)),
  };
}
