/**
 * `init` CLI — step 1 of the spec-in-package flow.
 *
 *   pnpm --filter @meridian/agent init -- <slug>
 *
 * Creates an empty agent package shell at packages/agents/<slug>. You then paste your
 * FrozenSpec into packages/agents/<slug>/spec.json and run the spec-to-agent skill (or
 * the `generate` CLI) to turn it into handlers and self-heal.
 */

import { initAgent } from './scaffold.js';

function main(): void {
  const [slug] = process.argv.slice(2).filter((a) => a !== '--');
  if (!slug) {
    console.error('usage: init <slug>');
    process.exit(1);
  }

  const { slug: used, outDir } = initAgent(slug);
  console.log(`Created agent shell → packages/agents/${used}`);
  console.log(`  ${outDir}`);
  console.log('\nNext:');
  console.log(`  1. paste your FrozenSpec JSON into  packages/agents/${used}/spec.json`);
  console.log('  2. pnpm install                     # link the new workspace package');
  console.log(`  3. /spec-to-agent packages/agents/${used}   # generate handlers + self-heal`);
}

main();
