"""Offline review — zero-config, no API key, no network. Synthesizes a believable
review from the deterministic findings. Port of packages/api/src/review/mock.ts.
This is the default 'mock' mode so a fresh clone runs the whole loop end-to-end.
"""
from __future__ import annotations

from typing import Any

from ..models import ReviewRequest
from ..spec.process_graph import analyze


def mock_draft(req: ReviewRequest) -> dict[str, Any]:
    open_comments = sum(
        1 for c in req.comments
        if not c.parentId and c.status in ("open", "answered")
    )
    graph = analyze(
        req.cards,
        req.edges,
        annotations=[a.model_dump() for a in req.annotations],
        open_comments=open_comments,
    )

    # Don't re-raise a gap that already has an open/answered thread on the same card.
    seen: set[str] = {
        str(c.cardId) for c in req.comments
        if not c.parentId and c.status in ("open", "answered")
    }

    new_comments: list[dict[str, Any]] = []
    for f in graph["findings"]:
        key = str(f["cardId"])
        if key in seen:
            continue
        seen.add(key)
        new_comments.append({
            "cardId": f["cardId"],
            "category": "missing_info" if f["kind"] == "fact_never_produced" else "structure",
            "body": f["detail"],
        })

    # Re-review: an 'answered' thread resolves once its card no longer has findings.
    flagged: set[str] = {f["cardId"] for f in graph["findings"]}
    status_updates: list[dict[str, Any]] = []
    for c in req.comments:
        if c.parentId or c.status != "answered":
            continue
        still_broken = c.cardId is not None and c.cardId in flagged
        if still_broken:
            status_updates.append({
                "commentId": c.id,
                "status": "open",
                "note": "The structural gap is still present — this looks unresolved.",
            })
        else:
            status_updates.append({
                "commentId": c.id,
                "status": "resolved",
                "note": "Looks addressed by your update.",
            })

    # Annotate the flagged cards with low confidence + the finding details as ambiguities.
    annotations: list[dict[str, Any]] = [
        {
            "cardId": c.id,
            "confidence": "low",
            "assumptions": [],
            "ambiguities": [f["detail"] for f in graph["findings"] if f["cardId"] == c.id],
        }
        for c in req.cards
        if c.id in flagged
    ]

    return {"newComments": new_comments, "statusUpdates": status_updates, "annotations": annotations}
