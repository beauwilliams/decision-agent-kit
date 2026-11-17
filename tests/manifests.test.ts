import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >;
}

const claude = read('.claude-plugin/plugin.json');
const codex = read('.codex-plugin/plugin.json');
const marketplace = read('.claude-plugin/marketplace.json');
const pack = read('package.json');

describe('plugin manifests', () => {
  it('agree on the name and version', () => {
    for (const manifest of [claude, codex]) {
      expect(manifest.name).toBe(pack.name);
      expect(manifest.version).toBe(pack.version);
    }
    const plugins = marketplace.plugins as { name: string; source: string }[];
    expect(marketplace.name).toBe(pack.name);
    expect(plugins.map((plugin) => plugin.name)).toEqual([pack.name]);
    expect(plugins[0]?.source).toBe('./');
  });

  it('point the Codex hooks at a command that exists, on the events the adapter reads', () => {
    const path = String(codex.hooks).replace(/^\.\//, '');
    const hooks = read(path).hooks as Record<string, { hooks: { command: string }[] }[]>;
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'Stop', 'UserPromptSubmit']);
    for (const groups of Object.values(hooks)) {
      for (const hook of groups.flatMap((group) => group.hooks)) {
        const file = /\$\{PLUGIN_ROOT\}\/([^"\s]+)/.exec(hook.command)?.[1];
        expect(file).toBeDefined();
        expect(existsSync(new URL(`../${file}`, import.meta.url))).toBe(true);
      }
    }
  });
});
