/**
 * Generated business logic for "Request Approval (example)".
 *
 * This is a *worked* example of a filled handler set — the output of one self-heal pass
 * over the scaffolder's stubs. The structural cards (Trigger, the two Outcomes) use the
 * runtime defaults; only the Action and the Branch carry logic.
 *
 * Pure compute so the eval runs hermetically; a real agent would call ctx.tools here
 * (e.g. ctx.tools.llm.extract to read a document, ctx.tools.composio.execute to read an inbox).
 */

import { branch, next } from '@meridian/agent';
import type { HandlerMap } from '@meridian/agent';

const RISK_THRESHOLD = 10_000;

export const handlers: HandlerMap = {
  // Action — derive a risk score from the inbound request and write it as a fact.
  a_score: async (ctx) => {
    const amount = Number(ctx.facts.amount ?? 0);
    const risk = amount > RISK_THRESHOLD ? 'high' : 'low';
    ctx.write('risk_score', risk);
    ctx.log(`amount=${amount} → risk_score=${risk}`);
    return next();
  },

  // Branch — read the fact the Action produced and pick a labeled path.
  d_risk: async (ctx) => {
    const low = ctx.facts.risk_score === 'low';
    ctx.log(`risk_score=${String(ctx.facts.risk_score)} → ${low ? 'Yes' : 'No'}`);
    return branch(low ? 'Yes' : 'No');
  },
};
