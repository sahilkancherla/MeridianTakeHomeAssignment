"""Record/replay cache for chat. Keyed by a stable hash of the canonicalized board
(positions stripped) + the message + turn count. Port of
packages/api/src/chat/fixtures.ts.
"""
from __future__ import annotations

from typing import Any

from ..models import ChatRequest
from ..serialize import card_payload, edge_payload
from ..util import FixtureStore, hash_key

store = FixtureStore("chat")


def fixture_key(req: ChatRequest) -> str:
    canonical = {
        "message": req.message.strip().lower(),
        "cards": sorted((card_payload(c) for c in req.cards), key=lambda d: d["id"]),
        "edges": sorted((edge_payload(e) for e in req.edges), key=lambda d: d["id"]),
        "turns": len(req.history),
    }
    return hash_key(canonical)


def load_fixture(key: str) -> dict[str, Any] | None:
    return store.load(key)


def save_fixture(key: str, result: dict[str, Any]) -> None:
    store.save(key, result)
