/**
 * The generated *business logic* for the example spec — one handler per card that
 * carries real logic. The structural cards (Trigger, the two Outcomes) need no handler:
 * the per-primitive defaults (steps/defaults.ts) move the Trigger along and terminate at
 * an Outcome. This is exactly the shape codegen produces for a real agent — only the
 * Actions/Rules/Branches get handlers.
 *
 * These handlers are pure compute so the demo runs offline. A real handler would reach
 * for `ctx.tools` here — e.g. `await ctx.tools.llm.extract(...)` to read a document, or
 * `await ctx.tools.composio.execute('GMAIL_FETCH_EMAILS', {...})` to read the inbox.
 */

import { branch, next } from '../../runtime/outcome.js';
import type { HandlerMap } from '../../steps/types.js';

const RISK_THRESHOLD = 10_000;

export const approvalHandlers: HandlerMap = {
  // Action: derive a fact from the inbound request and write it to the blackboard.
  a_score: (ctx) => {
    const amount = Number(ctx.facts.amount ?? 0);
    const risk = amount > RISK_THRESHOLD ? 'high' : 'low';
    ctx.write('risk_score', risk);
    ctx.log(`amount=${amount} → risk_score=${risk}`);
    return next();
  },

  // Branch: read the fact the Action produced and pick a labeled path.
  d_risk: (ctx) => {
    const low = ctx.facts.risk_score === 'low';
    ctx.log(`risk_score=${String(ctx.facts.risk_score)} → ${low ? 'Yes' : 'No'}`);
    return branch(low ? 'Yes' : 'No');
  },
};
