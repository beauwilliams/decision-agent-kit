type Pattern = {
  kind: string;
  regex: RegExp;
  replace?: (match: string, ...groups: string[]) => string;
};

const PATTERNS: Pattern[] = [
  {
    kind: 'private-key-block',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  },
  { kind: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: 'api-key', regex: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: 'github-token', regex: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { kind: 'aws-key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'service-token', regex: /\bops_[A-Za-z0-9_-]{40,}/g },
  { kind: 'bearer', regex: /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  // Also catches transaction and content hashes; losing those in the model's view costs little.
  { kind: 'hex-256', regex: /\b(?:0x)?[0-9a-fA-F]{64}\b/g },
  {
    kind: 'secret-assignment',
    regex:
      /\b([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|MNEMONIC|SEED_PHRASE)[A-Za-z0-9_]*)(\s*[=:]\s*["']?)([^\s"']{8,})/gi,
    replace: (_match, name, separator) => `${name}${separator}[redacted:secret-assignment]`,
  },
];

export type Redactor = {
  (text: string): string;
  /** How many matches were replaced so far. */
  count: number;
};

/**
 * Replaces credential-shaped text before it leaves the machine. Pattern
 * matching misses secrets with no recognisable shape (a mnemonic, a bare
 * password), so it lowers exposure and does not remove it.
 */
export function createRedactor(): Redactor {
  const redact = ((text: string): string => {
    let out = text;
    for (const pattern of PATTERNS) {
      out = out.replace(pattern.regex, (match: string, ...groups: string[]) => {
        if (match.includes('[redacted:')) return match;
        redact.count += 1;
        return pattern.replace ? pattern.replace(match, ...groups) : `[redacted:${pattern.kind}]`;
      });
    }
    return out;
  }) as Redactor;
  redact.count = 0;
  return redact;
}
