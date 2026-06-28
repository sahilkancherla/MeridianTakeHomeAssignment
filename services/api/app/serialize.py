"""Helpers that turn cards/edges into the position-free JSON payloads the prompts send
to the model (positions are layout, not meaning — stripped so the model reasons about
structure). Mirrors the `{ position: _pos, ...rest }` destructuring in the TS prompts.
"""
from __future__ import annotations

from typing import Any

from .spec.primitives import Card, Edge


def card_payload(card: Card) -> dict[str, Any]:
    d = card.model_dump(exclude_none=True)
    d.pop("position", None)
    return d


def edge_payload(edge: Edge) -> dict[str, Any]:
    return edge.model_dump(exclude_none=True)
