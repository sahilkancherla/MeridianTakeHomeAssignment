/**
 * `generate` CLI — step 3 of the spec-in-package flow.
 *
 *   pnpm --filter @meridian/agent generate -- <agentDir>
 *
 * Reads <agentDir>/spec.json and (re)writes the annotated handler stubs + the evals
 * template. Run it after pasting your FrozenSpec into the package's spec.json. The
 * spec-to-agent skill calls this for you.
 */

import { generateHandlers } from './scaffold.js';
import { resolveInput } from '../paths.js';

function main(): void {
  const [dirArg] = process.argv.slice(2).filter((a) => a !== '--');
  if (!dirArg) {
    console.error('usage: generate <agentDir>');
    process.exit(1);
  }
  const agentDir = resolveInput(dirArg);

  try {
    const { slug, logicCards, processName } = generateHandlers(agentDir);
    console.log(`Generated handlers for "${processName}" → packages/agents/${slug}`);
    console.log(`  ${logicCards} logic card(s) need handler bodies — see src/handlers.ts`);
    console.log('\nNext: fill src/handlers.ts + evals.json, then run the self-heal loop:');
    console.log(`  pnpm --filter @meridian/agent-${slug} eval`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
