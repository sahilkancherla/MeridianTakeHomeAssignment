/** Loads the frozen, immutable spec this agent was generated from. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FrozenSpec } from '@meridian/spec';

const here = dirname(fileURLToPath(import.meta.url));
export const spec = JSON.parse(readFileSync(join(here, '..', 'spec.json'), 'utf8')) as FrozenSpec;
