/** The runnable agent = the immutable spec + its generated handlers. */
import type { AgentBundle } from '@meridian/agent';
import { spec } from './spec.js';
import { handlers } from './handlers.js';

export const bundle: AgentBundle = { spec, handlers };
