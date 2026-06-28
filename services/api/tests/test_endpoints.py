"""End-to-end checks of the two endpoints in the default 'mock' mode (no API key, no
network) — the same path a fresh clone and the demo run.
"""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _force_mock(monkeypatch):
    """Pin both endpoints to offline 'mock' mode so these checks are deterministic
    regardless of the repo .env (which may set live/record/replay)."""
    monkeypatch.setitem(os.environ, "AI_REVIEW_MODE", "mock")
    monkeypatch.setitem(os.environ, "AI_EDIT_MODE", "mock")

# A board with an unrouted Branch path + a dangling exception → the mock review
# escalates findings into comments, and the mock chat can wire an exception onto it.
BOARD = json.loads((Path(__file__).parent / "parity_boards.json").read_text())["boards"]
RECEIVING = next(b for b in BOARD if b["name"] == "dangling_exception_and_unrouted_branch")


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_review_mock_escalates_findings():
    r = client.post("/api/review", json={
        "processName": "Receiving",
        "round": 1,
        "cards": RECEIVING["cards"],
        "edges": RECEIVING["edges"],
        "comments": [],
        "annotations": [],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["reviewRound"] == 1
    # The unrouted "No" branch + dangling exception are material gaps → comments raised.
    assert len(body["newComments"]) >= 1
    assert all(c["author"] == "ai" and c["status"] == "open" for c in body["newComments"])


def test_review_rejects_bad_body():
    r = client.post("/api/review", json={"processName": "x", "round": 1})
    assert r.status_code == 400


def test_chat_mock_question_answers():
    r = client.post("/api/chat", json={
        "processName": "Receiving",
        "cards": RECEIVING["cards"],
        "edges": RECEIVING["edges"],
        "history": [],
        "message": "What does this process do?",
    })
    assert r.status_code == 200
    assert r.json()["kind"] == "chat"


def test_chat_mock_edit_proposes_ops():
    r = client.post("/api/chat", json={
        "processName": "Receiving",
        "cards": RECEIVING["cards"],
        "edges": RECEIVING["edges"],
        "history": [],
        "message": "Add an exception for a missing COA",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "proposal"
    assert len(body["proposal"]["ops"]) >= 1
    assert body["proposal"]["status"] == "pending"


def test_chat_rejects_empty_message():
    r = client.post("/api/chat", json={
        "processName": "x", "cards": [], "edges": [], "history": [], "message": "  ",
    })
    assert r.status_code == 400
