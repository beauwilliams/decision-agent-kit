#!/bin/sh
# Installs the plugin from this checkout into a scratch profile for each
# harness and fails if that harness does not end up with a working copy.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
name=decision-agent-kit
version=$(node -p "require('$root/package.json').version")
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

need() {
  if [ ! -f "$1" ]; then
    echo "missing after install: $1" >&2
    exit 1
  fi
}

echo "== Claude Code $(claude --version)"
export CLAUDE_CONFIG_DIR="$scratch/claude"
mkdir -p "$CLAUDE_CONFIG_DIR"
claude plugin validate "$root"
claude plugin validate "$root/.claude-plugin/plugin.json"
claude plugin marketplace add "$root"
claude plugin install "$name@$name"
installed=$(claude plugin list --json | node -e '
  let text = "";
  process.stdin.on("data", (chunk) => (text += chunk));
  process.stdin.on("end", () => {
    const wanted = process.argv[1];
    const hit = JSON.parse(text).find((plugin) => plugin.id === wanted && plugin.enabled);
    if (!hit) process.exit(1);
    console.log(hit.installPath);
  });
' "$name@$name")
need "$installed/hooks/hooks.json"
need "$installed/hooks/register.ts"
need "$installed/skills/setup-$name/SKILL.md"

echo "== Codex $(codex --version 2>/dev/null | tail -1)"
export CODEX_HOME="$scratch/codex"
mkdir -p "$CODEX_HOME"
codex plugin marketplace add "$root" </dev/null
codex plugin add "$name@$name" </dev/null
installed="$CODEX_HOME/plugins/cache/$name/$name/$version"
need "$installed/.codex-plugin/hooks.json"
need "$installed/cli/hook.ts"
need "$installed/skills/setup-$name/SKILL.md"
out=$(echo '{"hook_event_name":"SessionStart"}' | PLUGIN_ROOT="$installed" PLUGIN_DATA="$scratch/data" node "$installed/cli/hook.ts")
if [ -n "$out" ]; then
  echo "the hook command printed output for an event it ignores: $out" >&2
  exit 1
fi

echo "both harnesses load $name $version"
