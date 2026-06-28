/**
 * Scaffolder CLI.
 *
 *   pnpm --filter @meridian/agent scaffold -- <specPath.json> [slug]
 *
 * Reads a FrozenSpec JSON (downloaded from the whiteboard / engineer spec inbox) and
 * writes a generated-agent package under packages/agents/<slug>. Generic to any spec.
 */

import { readFileSync } from 'node:fs';
import type { FrozenSpec } from '@meridian/spec';
import { scaffoldAgent } from './scaffold.js';
import { resolveInput } from '../paths.js';

function main(): void {
  const [specPathArg, slug] = process.argv.slice(2).filter((a) => a !== '--');
  if (!specPathArg) {
    console.error('usage: scaffold <specPath.json> [slug]');
    process.exit(1);
  }
  const specPath = resolveInput(specPathArg);

  let spec: FrozenSpec;
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf8')) as FrozenSpec;
  } catch (err) {
    console.error(`Could not read spec "${specPath}": ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  if (!spec.specId || !Array.isArray(spec.cards)) {
    console.error('That file does not look like a FrozenSpec (missing specId/cards).');
    process.exit(1);
  }

  const { slug: used, outDir, logicCards } = scaffoldAgent(spec, slug);
  console.log(`Scaffolded "${spec.processName}" → packages/agents/${used}`);
  console.log(`  ${spec.cards.length} cards (${logicCards} need handlers) · ${outDir}`);
  console.log('\nNext:');
  console.log('  1. pnpm install                      # link the new workspace package');
  console.log(`  2. fill src/handlers.ts + evals.json`);
  console.log(`  3. pnpm --filter @meridian/agent-${used} eval`);
}

main();
