/**
 * @meridian/agent — the reusable agent skeleton.
 *
 * A process-agnostic, durable state-machine runtime that runs any FrozenSpec produced by
 * the whiteboard. A *generated agent* is just an `AgentBundle` (the immutable spec + one
 * handler per logic card) that plugs into this runtime; the self-healing loop edits the
 * handlers, not the skeleton. See README.md for the architecture.
 */

// Runtime — the state machine (entry point, step execution, routing, guards).
export {
  orchestrate,
  type AgentInput,
  type AgentRun,
  type RunStatus,
  type RunConfig,
  type TraceEntry,
  type ExecuteStep,
  type ExecuteStepInput,
  type ExecuteStepResult,
} from './runtime/orchestrate.js';
export * from './runtime/outcome.js';
export * from './runtime/errors.js';
export { indexGraph, entryOf } from './runtime/graph.js';

// Steps — the business-logic contract + how a step is executed.
export type { StepContext, StepHandler, HandlerMap, AgentBundle } from './steps/types.js';
export { defaultHandler } from './steps/defaults.js';
export { createExecuteStep } from './steps/execute.js';

// Tools — the general tool surface + adapters (Composio, Anthropic) + offline fake.
export * from './tools/index.js';

// Temporal — durable hosting (worker + workflow + activities + client).
export { agentWorkflow, type AgentWorkflowArgs } from './temporal/workflow.js';
export { createActivities } from './temporal/activities.js';
export { startWorker, type WorkerOptions } from './temporal/worker.js';
export { runAgentWorkflow, type RunWorkflowOptions } from './temporal/client.js';
