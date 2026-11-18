import { execFileSync } from 'node:child_process';

interface ExportedRecord {
  id: string;
  status: string;
  state_disagrees_with_children: boolean;
  children_by_state: Record<string, number>;
}

const out = execFileSync('urzua', ['export', '--format', 'json', '--no-text'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const records = (JSON.parse(out) as { records: ExportedRecord[] }).records;
const stale = records.filter((r) => r.state_disagrees_with_children);
for (const r of stale) {
  const counts = Object.entries(r.children_by_state)
    .filter(([, n]) => n > 0)
    .map(([state, n]) => `${String(n)} ${state}`)
    .join(', ');
  console.error(`${r.id} is ${r.status} but its children are: ${counts}. Update its Status.`);
}
process.exit(stale.length > 0 ? 1 : 0);
