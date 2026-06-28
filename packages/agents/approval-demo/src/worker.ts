/** Production hosting: run this against a Temporal server (`temporal server start-dev`)
 *  to durably execute the agent.  pnpm --filter <this package> worker */
import { startWorker } from '@meridian/agent';
import { bundle } from './bundle.js';

startWorker(bundle).catch((err) => {
  console.error('[worker] failed:', err);
  process.exit(1);
});
