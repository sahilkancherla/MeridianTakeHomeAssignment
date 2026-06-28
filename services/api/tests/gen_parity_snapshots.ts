/**
 * Golden-snapshot generator for the FastAPI spec port. Runs the AUTHORITATIVE TS
 * analyze() over tests/parity_boards.json and writes the derived output to
 * tests/parity_snapshots.json. The Python parity test (test_spec_parity.py) asserts
 * its own analyze() reproduces these byte-for-byte (structurally).
 *
 * Run from repo root (regenerate only when the TS analyze() changes):
 *   npx tsx services/api/tests/gen_parity_snapshots.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '@meridian/spec';

const here = dirname(fileURLToPath(import.meta.url));
const boards = JSON.parse(readFileSync(join(here, 'parity_boards.json'), 'utf8')).boards as any[];

const snapshots: Record<string, unknown> = {};
for (const b of boards) {
  const g = analyze(b.cards, b.edges, {
    annotations: b.annotations ?? [],
    openComments: b.openComments ?? 0,
  });
  // Compare only the DERIVED fields — cards/edges are passthrough input.
  snapshots[b.name] = {
    entry: g.entry,
    terminals: g.terminals,
    branches: g.branches,
    facts: g.facts,
    findings: g.findings,
    completeness: g.completeness,
  };
}

writeFileSync(join(here, 'parity_snapshots.json'), JSON.stringify(snapshots, null, 2) + '\n');
console.log(`wrote ${Object.keys(snapshots).length} snapshots`);
