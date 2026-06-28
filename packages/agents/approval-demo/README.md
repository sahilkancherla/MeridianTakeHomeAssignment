# @meridian/agent-approval-demo

Generated agent for **Request Approval (example)** (spec `spec_cd6dc3ec`, v1).
Built from the frozen spec by the `spec-to-agent` skill onto the `@meridian/agent` skeleton.

- `spec.json` — the immutable frozen spec this agent was generated from.
- `src/handlers.ts` — the business logic: 2 handler(s), one per logic card. **Edit these.**
- `evals.json` — the external eval suite (input → expected). Fill in real cases.
- `src/worker.ts` — durable hosting on Temporal.
- `src/eval.ts` — runs the evals through an ephemeral Temporal server.

## Self-heal loop

```bash
pnpm install                                   # link this new workspace package
pnpm --filter @meridian/agent-approval-demo eval     # run evals through Temporal → eval-report.json
pnpm --filter @meridian/agent heal-status -- packages/agents/approval-demo   # STOP/CONTINUE verdict
```

The `spec-to-agent` skill drives this: fill handlers → eval → read failures → edit → repeat,
obeying the heal-controller's verdict (round cap, plateau, cycle detection). On give-up it
writes `HEAL_REPORT.md` classifying the remaining failures.
