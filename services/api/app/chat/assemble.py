"""Turn the model's raw output into the ChatResponse the web applies. The server is the
one trusted place that validates ops and stamps the proposal id. Port of
packages/api/src/chat/assemble.ts.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

from ..spec.edit_ops import summarize_ops, validate_ops
from .normalize import normalize_ops
from .schema import ChatOutput


def build_response(
    output: ChatOutput, graph: dict[str, Any], prompt: str, now: str
) -> Optional[dict[str, Any]]:
    """Build a ChatResponse from validated ops, or None if the proposal is incoherent."""
    ops = normalize_ops([o.model_dump() for o in output.ops]) if output.kind == "proposal" else []
    if output.kind == "chat" or len(ops) == 0:
        return {"kind": "chat", "text": output.text}

    result = validate_ops(graph["cards"], graph["edges"], ops)
    if not result["ok"]:
        return None  # caller decides whether to repair or fall back to a chat message.

    return {"kind": "proposal", "proposal": make_proposal(ops, output.text, prompt, now)}


def make_proposal(
    ops: list[dict[str, Any]], summary: str, prompt: str, now: str
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "prompt": prompt,
        "summary": (summary.strip() if summary else "") or summarize_ops(ops),
        "ops": ops,
        "status": "pending",
        "createdAt": now,
    }
