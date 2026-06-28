"""Turns the model's draft into the result the web app applies. The server stamps real
ids/status/author/timestamps so the model can never invent them. Port of
packages/api/src/review/assemble.ts.
"""
from __future__ import annotations

import uuid
from typing import Any

LOCAL_PROCESS_ID = "local"


def assemble(draft: dict[str, Any], review_round: int, now: str) -> dict[str, Any]:
    new_comments = [
        {
            "id": str(uuid.uuid4()),
            "processId": LOCAL_PROCESS_ID,
            "cardId": d.get("cardId"),
            "author": "ai",
            "body": d["body"],
            "status": "open",
            "category": d["category"],
            "createdAt": now,
            "updatedAt": now,
        }
        for d in draft["newComments"]
    ]

    status_updates = [
        {"commentId": u["commentId"], "status": u["status"], **({"note": u["note"]} if u.get("note") else {})}
        for u in draft["statusUpdates"]
    ]

    return {
        "reviewRound": review_round,
        "newComments": new_comments,
        "statusUpdates": status_updates,
        "annotations": draft["annotations"],
    }
