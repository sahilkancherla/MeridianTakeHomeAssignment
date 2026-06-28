"""AI Edit orchestrator. One entry point, four modes (mirrors the AI-review service).
The server is STATELESS: it validates and returns a proposal; confirm/discard/undo
happen client-side. Port of packages/api/src/chat/index.ts.
"""
from __future__ import annotations

import logging
from typing import Any

from ..config import edit_mode, edit_model
from ..models import ChatRequest
from ..spec.process_graph import analyze
from ..util import iso_now
from .assemble import build_response
from .fixtures import fixture_key, load_fixture, save_fixture
from .mock import mock_chat

log = logging.getLogger("meridian.chat")


def run_chat(req: ChatRequest) -> dict[str, Any]:
    mode = edit_mode()
    now = iso_now()
    graph = analyze(req.cards, req.edges)

    if mode == "mock":
        return build_response(mock_chat(req), graph, req.message, now) or _fallback()

    if mode == "replay":
        cached = load_fixture(fixture_key(req))
        if cached:
            return cached
        log.warning("no chat fixture for this board state — falling back to a live call")

    # live / record / replay-miss all need the real model.
    from .call_claude import call_claude

    output = call_claude(req, edit_model())
    # If the model returns an invalid proposal, ask it to repair ONCE; if it still fails,
    # fall back to an honest chat message rather than a broken preview.
    response = build_response(output, graph, req.message, now)
    if not response:
        repaired = call_claude(
            req.model_copy(update={
                "message": f"{req.message}\n\n(Your previous proposal referenced ids that don't "
                "exist. Use ONLY the exact ids in the graph, and tempIds for new cards.)"
            }),
            edit_model(),
        )
        response = build_response(repaired, graph, req.message, now)

    result = response or _fallback()
    if mode == "record":
        save_fixture(fixture_key(req), result)
    return result


def _fallback() -> dict[str, Any]:
    return {
        "kind": "chat",
        "text": "I couldn't safely make that change — the edit didn't map cleanly onto the "
        "current canvas. Could you rephrase, or be more specific about which card it affects?",
    }
