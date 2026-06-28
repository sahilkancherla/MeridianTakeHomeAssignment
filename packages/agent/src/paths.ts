/**
 * Path helpers for the CLIs. `pnpm --filter <pkg> <script>` runs the script with cwd set
 * to the *package* directory, so a user-supplied relative path (a spec file, an agent dir)
 * would otherwise resolve against packages/agent rather than where the user typed it.
 * `resolveInput` fixes that: absolute as-is, else cwd if it exists there, else the repo root.
 */

import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The monorepo root, found by walking up for pnpm-workspace.yaml. */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url)); // packages/agent/src
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'); // fallback: src → agent → packages → root
}

/** Resolve a user-supplied path: absolute as-is; else cwd if it exists; else under the repo root. */
export function resolveInput(p: string): string {
  if (isAbsolute(p)) return p;
  const fromCwd = resolve(process.cwd(), p);
  if (existsSync(fromCwd)) return fromCwd;
  return resolve(repoRoot(), p);
}
