---
name: spec-to-agent
description: Turn a frozen whiteboard spec into a self-healing Temporal agent. Scaffolds a generated-agent package from ANY FrozenSpec, writes the per-card business-logic handlers against the @meridian/agent skeleton, and runs the eval suite through a real Temporal server in a guarded self-heal loop (edit → eval → read failures → repeat) until the evals pass or it escalates with a classified report. Use when the user wants to generate/codegen/build an agent from a submitted spec, run the self-healing loop, or "turn this spec into an agent."
---

# spec-to-agent

Convert a submitted **frozen spec** into a working, durable agent and improve it against its
eval suite until it passes — the human-in-the-loop half of Task 2. You (the coding agent) own
the loop: the engineer feeds the spec + evals, you take over and self-heal against them.

This skill is **general to any spec** but **specific to this repo's environment**: it builds on
the `@meridian/agent` skeleton, its handler contract, its tool surface, and real Temporal
hosting. Read `packages/agent/README.md` once before starting if you haven't.

## Invocation

The spec lives **inside** the agent package as its source of truth. Two ways to start:

**Preferred — spec already in a package (`init` flow):** the engineer ran
`pnpm --filter @meridian/agent init-agent -- <slug>`, pasted their FrozenSpec into
`packages/agents/<slug>/spec.json`, and invokes:

`/spec-to-agent packages/agents/<slug>`

You then run `generate` on that directory (handlers stubs from its spec.json) and self-heal.
If `spec.json` is still the placeholder (has `_README`, no `specId`), STOP and tell the
engineer to paste their spec into it first.

**Alternate — a loose spec file:** `/spec-to-agent <path-to-spec.json> [slug]` — you run the
one-shot `scaffold` (init + spec + generate) and continue. If no arg at all, ask which they have.

## Preconditions (check first, fix before looping)

1. **The skeleton exists.** `packages/agent` (`@meridian/agent`) is present. If not, stop — this
   skill has nothing to build on.
2. **A Temporal server is reachable.** Run `temporal operator cluster health --address 127.0.0.1:7233`.
   If it fails, start one in the background: `temporal server start-dev --ip 127.0.0.1 --port 7233 --ui-port 8233 --log-level error`, then re-check. Evals run in **external mode** against it
   (`EVAL_TEMPORAL_ADDRESS=127.0.0.1:7233`), which is more reliable than the ephemeral download.
3. **Tool keys, only if the handlers need real tools.** If the process reads a real system (e.g.
   Gmail via Composio), ensure `.env` has `COMPOSIO_API_KEY` / `COMPOSIO_USER_ID` and
   `ANTHROPIC_API_KEY`. If not set, the offline fake toolset runs — fine for hermetic evals, but
   say so. Outbound stays simulated regardless (`AGENT_OUTBOUND_MODE=simulate`).

## The contract you generate against

A generated agent is an `AgentBundle = { spec, handlers }`. You write **`src/handlers.ts`** — one
`StepHandler` per **logic card** (Action / Rule / Branch). Structural cards (Trigger /
System / Input / Exception / Outcome) use the runtime defaults; don't write handlers for them
unless a default is wrong for that card.

```ts
type StepHandler = (ctx: StepContext) => StepOutcome | Promise<StepOutcome>;
// ctx.facts            — read facts earlier steps produced (the blackboard)
// ctx.write(name, val) — produce a fact for downstream cards
// ctx.log(line)        — annotate the trace (what this step did/decided)
// ctx.tools            — { composio.execute(slug, args, {sideEffect:'read'|'write'}), llm.complete/extract, secrets.get(key) }
// ctx.spec, ctx.attempt
// return one of: next() · branch(label) · raise(cond?) · goto(id) · finish(disposition) · fail(reason)
```

Authoritative types: `packages/agent/src/steps/types.ts`, `src/runtime/outcome.ts`,
`src/tools/types.ts`. The scaffolder annotates every stub with that card's fields, the facts it
consumes/produces, its branches, its linked System, and its context — read those comments; they
tell you exactly what each handler must do.

**Handler-writing rules:**
- A **Branch** returns `branch(label)` for the path whose condition holds (its labels are the
  exact path labels; a plain Yes/No split is just two paths).
- A **Rule** returns `next()` when it passes; `raise()` when it fails (so the process's Exception
  edge handles it). If it has no Exception edge, returning `fail(reason)` is honest.
- An **Action** does work (call `ctx.tools.*`), `ctx.write(...)` the facts it establishes, then
  `next()`. Use `ctx.tools.llm.extract({...})` to read documents into structured facts; use
  `ctx.tools.composio.execute(slug, args, { sideEffect: 'read' })` to read a system and
  `{ sideEffect: 'write' }` for outbound (which is simulated unless outbound mode is live).
- Keep handlers focused: read facts + call tools + return an outcome. **Never** touch edges, ids,
  or routing — that's the runtime's job.
- Prefer the fact names the scaffolder lists, and keep them consistent across producer/consumer
  cards so the data actually flows.

## The eval suite defines "correct" — do not fabricate it

Evals live in the generated `evals.json` (external by design). Each case is
`{ name, input: { facts }, expect: { status?, disposition?, facts?, factsContain?, traceIncludesCards? } }`.

**If `evals.json` is still the scaffolded TODO template (or any case has a `TODO` input/expected),
STOP and ask the engineer for the real eval cases (or the source — e.g. the sample inbox emails).**
You may *propose* candidate cases derived from the spec's outcomes/examples, but the human confirms
the expected outputs. Inventing ground truth silently defeats the entire point of the loop.

## Procedure

1. **Generate handlers from the in-package spec.** Confirm `packages/agents/<slug>/spec.json` is a
   real FrozenSpec (has `specId`, `cards`) — if it's still the placeholder, STOP and ask for the
   spec. Then: `pnpm --filter @meridian/agent generate -- packages/agents/<slug>` writes the
   annotated handler stubs. (Loose-file flow: `pnpm --filter @meridian/agent scaffold -- <spec.json> [slug]` does init+spec+generate in one shot.)
2. **Link it.** `pnpm install`. Then `pnpm --filter @meridian/agent-<slug> typecheck` to confirm a
   clean baseline.
3. **Settle the evals** (see the section above). Don't proceed to the loop with a TODO eval file.
4. **Reset the heal state:** `pnpm --filter @meridian/agent heal-status -- packages/agents/<slug> --reset`.
5. **Run the self-heal loop** (below) until the controller says STOP.
6. **Report.** On success: summarize the agent, where it lives, and how to host it
   (`pnpm --filter @meridian/agent-<slug> worker`). On give-up: write `HEAL_REPORT.md` and escalate.

## The self-heal loop (and its guardrails)

Repeat each round:

1. **Edit `src/handlers.ts`** — first round: implement all logic cards. Later rounds: fix only the
   handlers responsible for the failing cases (read `eval-report.json` mismatches; each names the
   case, expected vs got, and which facts/disposition diverged).
2. **Typecheck:** `pnpm --filter @meridian/agent-<slug> typecheck`. Don't run evals on code that
   doesn't compile.
3. **Run the evals through real Temporal:**
   `EVAL_TEMPORAL_ADDRESS=127.0.0.1:7233 pnpm --filter @meridian/agent-<slug> eval`
   → writes `packages/agents/<slug>/eval-report.json`.
4. **Snapshot if improved:** if this round passes more cases than any prior, copy
   `src/handlers.ts` to `src/handlers.best.ts` (your best-known-good).
5. **Ask the controller:** `pnpm --filter @meridian/agent heal-status -- packages/agents/<slug>`.
   It prints `Round N: P/T passing` and a verdict line:
   - **`HEAL: CONTINUE`** → go to step 1 and fix the next failures.
   - **`HEAL: STOP success`** → all pass. Done.
   - **`HEAL: STOP <plateau|cycle|max_rounds>`** → stop. If the run regressed below best, restore
     `src/handlers.best.ts`. Then escalate (below).

**Hard rules — these are not optional:**
- The controller's verdict is **authoritative**. Never run another round after `HEAL: STOP`. Never
  raise the caps to keep going (`HEAL_MAX_ROUNDS`/`HEAL_PLATEAU` are deliberate).
- Run `heal-status` **every** round — that's what records progress and detects plateau/cycles. If
  you skip it, you've disabled the guardrail.
- **Never edit `evals.json` to make a test pass.** If a case looks wrong, that's an escalation
  (`eval_error`), not a fix.
- For deterministic evals, prefer the fake toolset or low-temperature LLM calls so failures are
  real, not flaky. Don't chase noise.

## Escalation (when it can't converge)

On a non-success STOP, write `packages/agents/<slug>/HEAL_REPORT.md`:

- **Summary:** `P/T passing after N rounds`, stop reason, best round reached.
- **Per still-failing case:** name · expected vs got · the mismatch lines · a **classification**:
  - `code_bug` — the handler logic is wrong and attempts were exhausted on that card. Name the card.
  - `spec_underspecified` — the eval needs information no card in the spec captures (e.g. a threshold
    never specified). **Remediation: back to the whiteboard / AI review** — the spec is the gap, not
    the code. This is the product working as intended.
  - `eval_error` — the expected output itself looks wrong or self-contradictory; ask the engineer.
  - `missing_capability` — a tool/credential/integration isn't wired (Composio not connected, no
    inbox, missing key). An infra fix, not a code fix.
- **Round history:** the pass counts per round (from `.heal-state.json`).
- **Recommendation:** the single most useful next action for the human.

Then tell the engineer plainly: what passed, what didn't, and which class of fix each remaining
failure needs. Don't silently leave a half-working agent presented as done.

## Done

Report: the package path (`packages/agents/<slug>`), `P/T` evals passing, the handlers you wrote,
and the host command. If you started a Temporal dev server for the loop, mention it's still
running (and how to stop it) so the engineer can host the worker against it.
