/** Runs the eval suite (../evals.json) through a real ephemeral Temporal server.
 *  pnpm --filter <this package> eval  → writes eval-report.json, exits non-zero on failure. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEvalFile } from '@meridian/agent/eval';
import { bundle } from './bundle.js';

const here = dirname(fileURLToPath(import.meta.url));
const report = await runEvalFile(bundle, join(here, '..', 'evals.json'));
process.exit(report.passed === report.total ? 0 : 1);
