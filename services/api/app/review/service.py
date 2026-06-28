"""Review orchestrator. One entry point, four modes (docs/design/ai-review-spec.md §3.4):
  mock   — offline, no key, synthesized from deterministic findings (default; zero-config)
  live   — always call Claude
  record — call Claude, then write the result to a fixture
  replay — serve a committed fixture; fall back to live if none exists
Port of packages/api/src/review/index.ts.
"""
from __future__ import annotations

import logging
from typing import Any

from ..config import review_mode, review_model
from ..models import ReviewRequest
from ..util import iso_now
from .assemble import assemble
from .dedupe import dedupe_new_comments
from .fixtures import fixture_key, load_fixture, save_fixture
from .mock import mock_draft

log = logging.getLogger("meridian.review")


def run_review(req: ReviewRequest) -> dict[str, Any]:
    mode = review_mode()
    now = iso_now()

    # Cached fixtures were already deduped at record time — serve as-is.
    if mode == "replay":
        cached = load_fixture(fixture_key(req))
        if cached:
            return cached
        log.warning("no fixture for this board state — falling back to a live call")

    if mode == "mock":
        draft = mock_draft(req)
    else:
        from .call_claude import call_claude
        draft = call_claude(req, review_model())

    assembled = assemble(draft, req.round, now)
    # Convergence backstop: never re-raise a gap an existing thread already covers.
    existing = [c.model_dump() for c in req.comments]
    assembled["newComments"] = dedupe_new_comments(assembled["newComments"], existing)

    if mode == "record":
        save_fixture(fixture_key(req), assembled)
    return assembled
