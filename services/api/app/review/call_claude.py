"""The real Claude call for AI review. Forces structured output (no free-text parsing)
and turns on extended thinking. Port of packages/api/src/review/callClaude.ts.

Uses the Anthropic Python SDK's messages.parse() with output_format=<Pydantic model>,
which validates the response against ReviewSchema and returns a typed instance — the
direct analogue of the TS zodOutputFormat helper.
"""
from __future__ import annotations

from typing import Any

from anthropic import Anthropic

from ..llm import thinking_for
from ..models import ReviewRequest
from ..spec.process_graph import analyze
from .prompt import build_system_prompt, build_user_prompt
from .schema import ReviewSchema

MAX_TOKENS = 16000


def call_claude(req: ReviewRequest, model: str) -> dict[str, Any]:
    client = Anthropic()  # reads ANTHROPIC_API_KEY from env

    # Re-derive the graph server-side — never trust a client-sent analysis.
    open_comments = sum(
        1 for c in req.comments if not c.parentId and c.status in ("open", "answered")
    )
    graph = analyze(
        req.cards,
        req.edges,
        annotations=[a.model_dump() for a in req.annotations],
        open_comments=open_comments,
    )

    # Structured output is forced via output_format; the stable primitive vocabulary in
    # `system` is prompt-cached so re-reviews are cheap.
    res = client.messages.parse(
        model=model,
        max_tokens=MAX_TOKENS,
        thinking=thinking_for(model, MAX_TOKENS),
        system=[{
            "type": "text",
            "text": build_system_prompt(),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{
            "role": "user",
            "content": build_user_prompt(req.processName, graph, req.comments),
        }],
        output_format=ReviewSchema,
    )

    out = res.parsed_output
    if not out:
        raise RuntimeError("model returned no structured output (refusal or truncation)")
    return out.model_dump()
