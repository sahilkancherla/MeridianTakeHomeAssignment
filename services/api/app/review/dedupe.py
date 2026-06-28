"""Convergence backstop for AI review. Port of packages/api/src/review/dedupe.ts.
Drops a new comment that duplicates an existing top-level thread on the same card, so
the open-comment count can actually reach zero.
"""
from __future__ import annotations

from typing import Any


def dedupe_new_comments(
    new_comments: list[dict[str, Any]], existing: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    threads = [c for c in existing if not c.get("parentId")]
    return [
        nc for nc in new_comments
        if not any(
            ex.get("cardId") == nc.get("cardId") and _similar(ex.get("body", ""), nc.get("body", ""))
            for ex in threads
        )
    ]


def _similar(a: str, b: str) -> bool:
    """Token-set Jaccard similarity over normalized words; >= 0.5 => the same gap."""
    ta = _token_set(a)
    tb = _token_set(b)
    if not ta or not tb:
        return False
    inter = len(ta & tb)
    union = len(ta) + len(tb) - inter
    return inter / union >= 0.5


def _token_set(s: str) -> set[str]:
    import re
    return {w for w in re.split(r"[^a-z0-9]+", s.lower()) if len(w) > 2}
