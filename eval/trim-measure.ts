import type { Block } from '../src/features/trim/trim.ts';

const TOKEN = /[A-Za-z0-9_./:-]{12,}/g;

/** Long identifier-like strings: paths, names, hashes, flags. Needs a letter and a digit or one of `_./-`. */
export function distinctiveTokens(text: string): string[] {
  const found = new Set<string>();
  for (const token of text.match(TOKEN) ?? []) {
    if (/[A-Za-z]/.test(token) && /[0-9_./-]/.test(token)) found.add(token);
  }
  return [...found];
}

export type Harm = { tokens: number; used: number; usedLater: boolean };

/**
 * Tokens that appear only in the cut lines (not in what is kept, the command or
 * the request), and whether any of them shows up in the later session text.
 */
export function harm(
  lines: readonly string[],
  cutLines: ReadonlySet<number>,
  command: string,
  request: string,
  later: string,
): Harm {
  const cut: string[] = [];
  const kept: string[] = [command, request];
  lines.forEach((line, i) => (cutLines.has(i) ? cut : kept).push(line));
  const keptText = kept.join('\n');
  const lost = distinctiveTokens(cut.join('\n')).filter((token) => !keptText.includes(token));
  const used = lost.filter((token) => later.includes(token)).length;
  return { tokens: lost.length, used, usedLater: used > 0 };
}

export function lineSet(blocks: readonly Block[]): Set<number> {
  const set = new Set<number>();
  for (const block of blocks) for (let i = block.start; i < block.end; i++) set.add(i);
  return set;
}

export function keptChars(lines: readonly string[], cutLines: ReadonlySet<number>): number {
  let total = 0;
  lines.forEach((line, i) => {
    if (!cutLines.has(i)) total += line.length + 1;
  });
  return total;
}

/**
 * Head and tail only: the first `headLines` and last `tailLines` lines, with
 * more lines from the start until at least `modelKept` characters are kept.
 */
export function baselineCut(
  lines: readonly string[],
  modelKept: number,
  headLines: number,
  tailLines: number,
): Block | undefined {
  let head = Math.min(headLines, lines.length);
  const tail = Math.max(head, lines.length - tailLines);
  let kept = 0;
  for (let i = 0; i < head; i++) kept += (lines[i] as string).length + 1;
  for (let i = tail; i < lines.length; i++) kept += (lines[i] as string).length + 1;
  while (kept < modelKept && head < tail) {
    kept += (lines[head] as string).length + 1;
    head++;
  }
  return head < tail ? { start: head, end: tail } : undefined;
}
