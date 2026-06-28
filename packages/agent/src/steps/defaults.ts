/**
 * Per-primitive default behavior — what a card does when codegen hasn't written a
 * handler for it. This encodes the *generic* meaning of each primitive so generated
 * agents only implement the cards that carry real logic.
 *
 * The split is intentional:
 *   • Structural primitives (Trigger, System, Input, Exception, Outcome) have a sensible
 *     default — they move the machine along or terminate it.
 *   • Logic primitives (Action, Rule, Branch) default to *unimplemented*, which
 *     fails the run with a precise message. That failure is the signal the self-healing
 *     loop reads: "write this step." Better a loud, located gap than a silent wrong path.
 */

import type { Card } from '@meridian/spec';
import { finish, next, type StepOutcome } from '../runtime/outcome.js';
import { UnimplementedStepError } from '../runtime/errors.js';
import type { StepContext, StepHandler } from './types.js';

export function defaultHandler(card: Card): StepHandler {
  switch (card.type) {
    // Trigger seeds the run; the inbound data is already on the blackboard. Advance.
    case 'trigger':
      return () => next();

    // A System is a resource other cards reference, not a step. If walked, pass through.
    case 'system':
      return () => next();

    // An Input is "this information is needed here". With no parsing logic, assume it is
    // present (seeded by the Trigger or an earlier Action) and advance. Real extraction
    // is a generated Action handler, not an Input default.
    case 'input':
      return () => next();

    // An Exception with no custom handler just follows its outgoing edge (often a
    // loop-back to an earlier step — "go chase the missing document").
    case 'exception':
      return () => next();

    // An Outcome terminates the run with its disposition.
    case 'outcome':
      return (ctx: StepContext) => finish(card.disposition ?? card.label) as StepOutcome;

    // Logic primitives must be generated. Fail loudly and precisely.
    case 'action':
    case 'rule':
    case 'branch':
      return () => {
        throw new UnimplementedStepError(card.id, card.type, card.label);
      };
  }
}
