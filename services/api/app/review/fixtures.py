"""Record/replay cache so the demo + Loom run deterministically and offline. Keyed by a
stable hash of the canonicalized board state (positions stripped) + round. Port of
packages/api/src/review/fixtures.ts.
"""
from __future__ import annotations

from typing import Any

from ..models import ReviewRequest
from ..serialize import card_payload, edge_payload
from ..util import FixtureStore, hash_key

store = FixtureStore()


def fixture_key(req: ReviewRequest) -> str:
    canonical = {
        "round": req.round,
        "cards": sorted((card_payload(c) for c in req.cards), key=lambda d: d["id"]),
        "edges": sorted((edge_payload(e) for e in req.edges), key=lambda d: d["id"]),
        "comments": sorted(
            (
                {
                    "id": c.id,
                    "cardId": c.cardId,
                    "author": c.author,
                    "body": c.body,
                    "status": c.status,
                    "category": c.category,
                    "parentId": c.parentId,
                }
                for c in req.comments
            ),
            key=lambda d: d["id"],
        ),
    }
    return hash_key(canonical)


def load_fixture(key: str) -> dict[str, Any] | None:
    return store.load(key)


def save_fixture(key: str, result: dict[str, Any]) -> None:
    store.save(key, result)
