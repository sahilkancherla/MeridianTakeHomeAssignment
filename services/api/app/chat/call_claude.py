"""The real Claude call for AI canvas editing. Port of packages/api/src/chat/callClaude.ts.

JSON mode (not grammar-constrained structured output): the op-patch schema is too
complex for the structured-output grammar compiler, so we ask the model for a single
JSON object and validate it with the SAME Pydantic schema (ChatOutput) server-side —
still schema-checked, never loose parsing; the orchestrator's repair-retry handles a
malformed reply.
"""
from __future__ import annotations

import json
import re

from anthropic import Anthropic
from pydantic import ValidationError

from ..llm import thinking_for
from ..models import ChatRequest
from ..spec.process_graph import analyze
from .prompt import build_system_prompt, build_user_prompt
from .schema import ChatOutput

MAX_TOKENS = 16000

_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def call_claude(req: ChatRequest, model: str) -> ChatOutput:
    client = Anthropic()  # reads ANTHROPIC_API_KEY from env

    # Re-derive the graph server-side — never trust a client-sent analysis.
    graph = analyze(req.cards, req.edges)

    res = client.messages.create(
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
            "content": build_user_prompt(req.processName, graph, req.history, req.message),
        }],
    )

    text = "\n".join(b.text for b in res.content if b.type == "text").strip()
    if not text:
        raise RuntimeError("model returned no text (refusal or truncation)")

    try:
        return ChatOutput.model_validate(_extract_json(text))
    except (ValidationError, ValueError, json.JSONDecodeError) as e:
        raise RuntimeError(f"model did not return valid chat JSON: {e}")


def _extract_json(text: str) -> object:
    """Pull the JSON object out of the model's reply, tolerating ```json fences or a
    stray sentence around it."""
    fenced = _FENCE_RE.search(text)
    body = (fenced.group(1) if fenced else text).strip()
    start = body.find("{")
    end = body.rfind("}")
    chunk = body[start:end + 1] if start >= 0 and end > start else body
    return json.loads(chunk)
