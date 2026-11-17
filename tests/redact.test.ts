import { describe, expect, it } from 'vitest';

import { createRedactor } from '../src/core/redact.ts';

describe('createRedactor', () => {
  it('replaces credential shapes and counts them', () => {
    const redact = createRedactor();
    const out = redact(
      [
        'key sk-abcdefghijklmnopqrstuvwxyz012345',
        'auth: Bearer abcdefghijklmnopqrstuvwxyz.0123456789',
        `hash 0x${'a1'.repeat(32)}`,
        '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
      ].join('\n'),
    );
    expect(out).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
    expect(out).not.toContain('a1a1a1');
    expect(out).not.toContain('OPENSSH');
    expect(out).toContain('[redacted:api-key]');
    expect(redact.count).toBe(4);
  });

  it('keeps the name of an assigned secret and drops its value', () => {
    const redact = createRedactor();
    expect(redact('DATABASE_PASSWORD="hunter2hunter2"')).toBe(
      'DATABASE_PASSWORD="[redacted:secret-assignment]"',
    );
  });

  it('leaves ordinary text alone', () => {
    const redact = createRedactor();
    const text = 'Read src/core/redact.ts and ran 14 tests in 320ms; commit 3bcac71';
    expect(redact(text)).toBe(text);
    expect(redact.count).toBe(0);
  });
});
