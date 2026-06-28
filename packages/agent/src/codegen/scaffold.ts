/**
 * The scaffolder — deterministic structure codegen, in two steps so the spec can live
 * *inside* the agent package as its source of truth:
 *
 *   1. `initAgent(slug)`      — lay down an empty agent package shell (package.json,
 *                               tsconfig, bundle/worker/eval wiring, a placeholder
 *                               spec.json, empty handlers + evals). No spec needed yet.
 *   2. you paste your FrozenSpec into `packages/agents/<slug>/spec.json`.
 *   3. `generateHandlers(dir)` — read that spec.json and (re)write `handlers.ts` with a
 *                               stub per logic card, **annotated with that card's fields,
 *                               the facts it consumes/produces, its branches, its linked
 *                               System, and its context** — plus an evals.json template.
 *
 * `scaffoldAgent(spec)` runs all three at once for the one-shot flow (spec already in hand).
 * Nothing here is specific to a use case; it reads the spec generically.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Card, FrozenSpec } from '@meridian/spec';
import type { Fact } from '@meridian/spec';
import { repoRoot } from '../paths.js';

const LOGIC_TYPES = new Set(['action', 'rule', 'branch']);

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'agent'
  );
}

/** Step 1 — create an empty agent package shell. No spec required yet; the spec is added
 *  to spec.json afterwards. Files that don't depend on the spec are final; handlers and
 *  evals are placeholders until `generateHandlers` runs. */
export function initAgent(slugArg: string): { slug: string; outDir: string } {
  const slug = slugify(slugArg);
  const outDir = join(repoRoot(), 'packages', 'agents', slug);
  mkdirSync(join(outDir, 'src'), { recursive: true });

  writeFileSync(join(outDir, 'package.json'), packageJson(slug));
  writeFileSync(join(outDir, 'tsconfig.json'), tsconfigJson());
  writeFileSync(join(outDir, 'spec.json'), specPlaceholder(slug));
  writeFileSync(join(outDir, 'evals.json'), '[]\n');
  writeFileSync(join(outDir, 'src', 'spec.ts'), specModule());
  writeFileSync(join(outDir, 'src', 'handlers.ts'), handlersPlaceholder());
  writeFileSync(join(outDir, 'src', 'bundle.ts'), bundleModule());
  writeFileSync(join(outDir, 'src', 'worker.ts'), workerModule());
  writeFileSync(join(outDir, 'src', 'eval.ts'), evalModule());
  writeFileSync(join(outDir, 'README.md'), readme(null, slug, 0));

  return { slug, outDir };
}

/** Step 3 — read `<agentDir>/spec.json` and (re)write the annotated handler stubs + the
 *  evals template. Throws if spec.json hasn't been filled in yet. Does NOT clobber an
 *  evals.json that already has real cases. */
export function generateHandlers(agentDir: string): { slug: string; logicCards: number; processName: string } {
  const specPath = join(agentDir, 'spec.json');
  let spec: FrozenSpec;
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf8')) as FrozenSpec;
  } catch (err) {
    throw new Error(`Could not read ${specPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!spec.specId || !Array.isArray(spec.cards)) {
    throw new Error(`${specPath} is not a FrozenSpec yet — paste your spec JSON into it, then re-run.`);
  }

  const slug = basename(agentDir);
  const logicCards = spec.cards.filter((c) => LOGIC_TYPES.has(c.type));
  writeFileSync(join(agentDir, 'src', 'handlers.ts'), handlersModule(spec, logicCards));
  writeFileSync(join(agentDir, 'README.md'), readme(spec, slug, logicCards.length));

  // Only seed the evals template if the file is still empty/placeholder — never overwrite
  // real cases the engineer has written.
  const evalsPath = join(agentDir, 'evals.json');
  const existing = existsSync(evalsPath) ? readFileSync(evalsPath, 'utf8').trim() : '';
  if (existing === '' || existing === '[]') writeFileSync(evalsPath, evalsTemplate(spec));

  return { slug, logicCards: logicCards.length, processName: spec.processName };
}

export type ScaffoldResult = { slug: string; outDir: string; logicCards: number };

/** One-shot: init the shell, drop the spec in, and generate handlers — for when the spec
 *  is already in hand (the `scaffold` CLI / programmatic use). */
export function scaffoldAgent(spec: FrozenSpec, slugArg?: string): ScaffoldResult {
  const slug = slugArg ? slugify(slugArg) : slugify(spec.processName);
  const { outDir } = initAgent(slug);
  writeFileSync(join(outDir, 'spec.json'), JSON.stringify(spec, null, 2));
  const { logicCards } = generateHandlers(outDir);
  return { slug, outDir, logicCards };
}

// --- per-card annotation ----------------------------------------------------

function factsFor(cardId: string, facts: Fact[]): { produces: string[]; consumes: string[] } {
  return {
    produces: facts.filter((f) => f.producedBy.includes(cardId)).map((f) => f.name),
    consumes: facts.filter((f) => f.consumedBy.includes(cardId)).map((f) => f.name),
  };
}

function annotate(card: Card, spec: FrozenSpec): string {
  const lines: string[] = [];
  const push = (s: string) => lines.push(`  // ${s}`);

  push(`─── ${card.label}  (${card.type})  [${card.id}] ${'─'.repeat(Math.max(0, 40 - card.label.length))}`);
  if (card.description) push(card.description);

  const { produces, consumes } = factsFor(card.id, spec.graph.facts);
  if (consumes.length) push(`consumes facts: ${consumes.join(', ')}  → read via ctx.facts.<name>`);
  if (produces.length) push(`produces facts: ${produces.join(', ')}  → set via ctx.write('<name>', value)`);

  if (card.type === 'branch') {
    push('paths (return branch(label)):');
    for (const b of card.branches) push(`  • ${b.label}: when "${b.condition}"`);
  }
  if (card.type === 'rule') push(`condition: "${card.expression}"   → pass: next(); fail: raise() (if it has an Exception edge)`);
  if (card.type === 'action' && card.systemId) {
    const sys = spec.cards.find((c) => c.id === card.systemId && c.type === 'system');
    if (sys && sys.type === 'system') {
      // The owner describes access in plain language; you pick the matching Composio tool.
      push(`uses System: ${sys.label}${sys.access ? ` — access: ${sys.access}` : sys.integration ? ` (${sys.integration})` : ''}`);
      for (const s of sys.secrets ?? [])
        push(`  secret: ${s.label} → await ctx.tools.secrets.get('${s.key}')${s.description ? `  (${s.description})` : ''}`);
    } else {
      push(`uses System: ${card.systemId}`);
    }
    push("tool hint: await ctx.tools.composio.execute('<TOOLKIT_ACTION>', { ... }, { sideEffect: 'read' | 'write' })");
  }
  if (card.type === 'action' && card.waitDays) push(`wait-up-to: ${card.waitDays} day(s) — model retries/give-up via ctx.attempt + raise()`);
  // Declared data fields (Input.fields / Action.produces) are the extraction schema —
  // produce each as a fact so downstream Rules/Branches can read it.
  {
    const declared = card.type === 'input' ? card.fields : card.type === 'action' ? card.produces : undefined;
    for (const f of declared ?? [])
      push(`field: ${f.name}${f.required ? ' (required)' : ''}${f.description ? ` — ${f.description}` : ''}${f.example ? `  e.g. ${f.example}` : ''}`);
  }

  const ctx = card.context;
  if (ctx) {
    if (ctx.criticality) push(`criticality: ${ctx.criticality}`);
    if (ctx.humanInLoop) push('human-in-loop: a person must confirm before proceeding');
    for (const n of ctx.notes ?? []) push(`note: ${n}`);
    for (const r of ctx.references ?? []) push(`ref: ${r.label} — ${r.url}`);
    for (const e of ctx.examples ?? []) push(`example: ${e.input}  →  ${e.expected}`);
    if (ctx.attachments?.length) push(`attachments: ${ctx.attachments.map((a) => a.name).join(', ')}`);
  }

  push('TODO(codegen): implement. Read ctx.facts, call ctx.tools.* as needed, ctx.write(...),');
  push('  then return next() / branch(label) / raise() / finish(disposition) / fail(reason).');
  return lines.join('\n');
}

function stubBody(card: Card): string {
  return `  '${card.id}': async (ctx) => {\n    throw new Error('TODO: implement "${card.label}" (${card.type} ${card.id})');\n  },`;
}

// --- file templates ---------------------------------------------------------

function handlersModule(spec: FrozenSpec, logicCards: Card[]): string {
  const structural = spec.cards.filter((c) => !LOGIC_TYPES.has(c.type));
  const entries = logicCards.map((c) => `${annotate(c, spec)}\n${stubBody(c)}`).join('\n\n');
  return `/**
 * Generated business logic for "${spec.processName}".
 *
 * One handler per logic card (Action / Rule / Decision / Branch). The structural cards
 * below use the runtime's per-primitive defaults — no handler needed:
${structural.map((c) => ` *   • ${c.label} (${c.type})`).join('\n') || ' *   (none)'}
 *
 * Fill each handler body. Use ctx.facts (read), ctx.write(name, value) (produce),
 * ctx.tools.composio.execute(...) / ctx.tools.llm.extract(...) (tool calls), and return a
 * StepOutcome. Keep handlers focused — routing is the runtime's job.
 */

import { branch, fail, finish, next, raise } from '@meridian/agent';
import type { HandlerMap } from '@meridian/agent';

export const handlers: HandlerMap = {
${entries}
};
`;
}

function specModule(): string {
  return `/** Loads the frozen, immutable spec this agent was generated from. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FrozenSpec } from '@meridian/spec';

const here = dirname(fileURLToPath(import.meta.url));
export const spec = JSON.parse(readFileSync(join(here, '..', 'spec.json'), 'utf8')) as FrozenSpec;
`;
}

function bundleModule(): string {
  return `/** The runnable agent = the immutable spec + its generated handlers. */
import type { AgentBundle } from '@meridian/agent';
import { spec } from './spec.js';
import { handlers } from './handlers.js';

export const bundle: AgentBundle = { spec, handlers };
`;
}

function workerModule(): string {
  return `/** Production hosting: run this against a Temporal server (\`temporal server start-dev\`)
 *  to durably execute the agent.  pnpm --filter <this package> worker */
import { startWorker } from '@meridian/agent';
import { bundle } from './bundle.js';

startWorker(bundle).catch((err) => {
  console.error('[worker] failed:', err);
  process.exit(1);
});
`;
}

function evalModule(): string {
  return `/** Runs the eval suite (../evals.json) through a real ephemeral Temporal server.
 *  pnpm --filter <this package> eval  → writes eval-report.json, exits non-zero on failure. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvalFile } from '@meridian/agent/eval';
import { bundle } from './bundle.js';

const here = dirname(fileURLToPath(import.meta.url));
const report = await runEvalFile(bundle, join(here, '..', 'evals.json'));
process.exit(report.passed === report.total ? 0 : 1);
`;
}

function evalsTemplate(spec: FrozenSpec): string {
  // One placeholder case per distinct Outcome disposition, so the shape is obvious.
  const dispositions = [...new Set(spec.outcomes.map((o) => o.disposition).filter(Boolean))];
  const cases = (dispositions.length ? dispositions : ['TODO']).map((d) => ({
    name: `TODO-reaches-${d || 'outcome'}`,
    input: { facts: { TODO: 'replace with the seed facts for this case (e.g. the inbound email)' } },
    expect: { status: 'completed', disposition: d },
  }));
  return JSON.stringify(cases, null, 2) + '\n';
}

function packageJson(slug: string): string {
  return (
    JSON.stringify(
      {
        name: `@meridian/agent-${slug}`,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          worker: 'tsx src/worker.ts',
          eval: 'tsx src/eval.ts',
          typecheck: 'tsc --noEmit',
        },
        dependencies: {
          '@meridian/agent': 'workspace:*',
          '@meridian/spec': 'workspace:*',
        },
        devDependencies: {
          '@types/node': '^22.10.0',
          tsx: '^4.19.0',
          typescript: '^5.5.4',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

function tsconfigJson(): string {
  return (
    JSON.stringify(
      {
        extends: '../../../tsconfig.base.json',
        compilerOptions: { rootDir: './src', noEmit: true, types: ['node'] },
        include: ['src'],
      },
      null,
      2,
    ) + '\n'
  );
}

/** A placeholder spec.json written by `initAgent` — clearly not a FrozenSpec, so
 *  `generateHandlers` refuses to run until it's replaced with the real spec. */
function specPlaceholder(slug: string): string {
  return (
    JSON.stringify(
      {
        _README:
          'Replace this entire file with your FrozenSpec JSON (downloaded from the whiteboard / engineer spec inbox).',
        _then: `Run:  /spec-to-agent packages/agents/${slug}   (or:  pnpm --filter @meridian/agent generate -- packages/agents/${slug})`,
      },
      null,
      2,
    ) + '\n'
  );
}

/** A placeholder handlers.ts written by `initAgent` — empty until `generateHandlers`
 *  reads the spec and writes the real annotated stubs. */
function handlersPlaceholder(): string {
  return `/**
 * Empty until the spec is added. After you paste your FrozenSpec into ../spec.json, run
 * \`generate\` (or the spec-to-agent skill) to (re)write this file with one annotated stub
 * per logic card.
 */

import type { HandlerMap } from '@meridian/agent';

export const handlers: HandlerMap = {};
`;
}

function readme(spec: FrozenSpec | null, slug: string, logicCount: number): string {
  const header = spec
    ? `Generated agent for **${spec.processName}** (spec \`${spec.specId}\`, v${spec.version}).`
    : `Agent shell for **${slug}** — **add your spec next** (see below).`;
  const addSpec = spec
    ? ''
    : `## Add your spec first

1. Paste your FrozenSpec JSON into \`spec.json\` (replacing the placeholder).
2. \`pnpm install\` to link this package.
3. \`/spec-to-agent packages/agents/${slug}\` — generates the handler stubs from the spec and
   runs the self-heal loop. (Or, by hand: \`pnpm --filter @meridian/agent generate -- packages/agents/${slug}\`.)

`;
  return `# @meridian/agent-${slug}

${header}
Built on the \`@meridian/agent\` skeleton.

${addSpec}- \`spec.json\` — the immutable frozen spec this agent is generated from (its source of truth).
- \`src/handlers.ts\` — the business logic${spec ? `: ${logicCount} handler(s), one per logic card. **Edit these.**` : ' (generated from the spec).'}
- \`evals.json\` — the external eval suite (input → expected). Fill in real cases.
- \`src/worker.ts\` — durable hosting on Temporal.
- \`src/eval.ts\` — runs the evals through Temporal.

## Self-heal loop

\`\`\`bash
pnpm --filter @meridian/agent-${slug} eval     # run evals through Temporal → eval-report.json
pnpm --filter @meridian/agent heal-status -- packages/agents/${slug}   # STOP/CONTINUE verdict
\`\`\`

The \`spec-to-agent\` skill drives this: fill handlers → eval → read failures → edit → repeat,
obeying the heal-controller's verdict (round cap, plateau, cycle detection). On give-up it
writes \`HEAL_REPORT.md\` classifying the remaining failures.
`;
}
