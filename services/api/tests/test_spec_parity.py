"""Parity guard: the Python analyze() must reproduce the TS analyze() byte-for-byte
(structurally). Golden snapshots in parity_snapshots.json are produced by the
authoritative TS implementation via gen_parity_snapshots.ts. If this test fails, the
port has drifted from packages/spec and must be reconciled.
"""
import json
from pathlib import Path

import pytest

from app.spec.primitives import Card, Edge
from app.spec.process_graph import analyze

HERE = Path(__file__).parent
BOARDS = json.loads((HERE / "parity_boards.json").read_text())["boards"]
SNAPSHOTS = json.loads((HERE / "parity_snapshots.json").read_text())


def _derived(board: dict) -> dict:
    cards = [Card(**c) for c in board["cards"]]
    edges = [Edge(**e) for e in board["edges"]]
    g = analyze(
        cards,
        edges,
        annotations=board.get("annotations", []),
        open_comments=board.get("openComments", 0),
    )
    # Round-trip through JSON so we compare plain data (dicts/lists), matching the snapshot.
    return json.loads(json.dumps({
        "entry": g["entry"],
        "terminals": g["terminals"],
        "branches": g["branches"],
        "facts": g["facts"],
        "findings": g["findings"],
        "completeness": g["completeness"],
    }))


@pytest.mark.parametrize("board", BOARDS, ids=[b["name"] for b in BOARDS])
def test_analyze_matches_ts_snapshot(board: dict) -> None:
    assert _derived(board) == SNAPSHOTS[board["name"]]
