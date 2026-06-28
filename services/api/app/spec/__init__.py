"""Python port of the subset of @meridian/spec the API server depends on.

The TypeScript package in packages/spec remains the single source of truth for the
web app and the agent codegen. This port covers ONLY what the API needs at runtime:
the primitive vocabulary, analyze() (the pure ProcessGraph transform), and the
edit-op helpers (validate_ops, summarize_ops). applyOps and the frozen-spec builders
are deliberately NOT ported — they are client-side / later-milestone concerns.

Parity with the TS implementation is enforced by tests/test_spec_parity.py, which
diffs this port's output against golden snapshots produced by the TS analyze().
"""
