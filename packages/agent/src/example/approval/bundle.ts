/** The example agent as a runnable bundle (spec + handlers) — the unit a worker hosts. */

import type { AgentBundle } from '../../steps/types.js';
import { approvalSpec } from './spec.js';
import { approvalHandlers } from './handlers.js';

export const exampleBundle: AgentBundle = {
  spec: approvalSpec,
  handlers: approvalHandlers,
};
