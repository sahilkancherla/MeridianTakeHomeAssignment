"""Shared helpers: deterministic JSON hashing for record/replay fixtures, and a tiny
file-backed fixture store. Mirrors the stableStringify hashing the TS server used so
the same board state always maps to the same fixture key.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

FIXTURES_ROOT = Path(__file__).resolve().parent.parent / "fixtures"


def iso_now() -> str:
    """UTC timestamp in the same shape as JS new Date().toISOString()."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def stable_stringify(value: Any) -> str:
    """Deterministic JSON: object keys sorted recursively (port of the TS helper)."""
    if value is None or not isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(stable_stringify(v) for v in value) + "]"
    items = sorted(value.keys())
    return "{" + ",".join(
        json.dumps(k, ensure_ascii=False) + ":" + stable_stringify(value[k]) for k in items
    ) + "}"


def hash_key(canonical: Any) -> str:
    return hashlib.sha256(stable_stringify(canonical).encode("utf-8")).hexdigest()[:16]


class FixtureStore:
    """Record/replay cache under services/api/fixtures[/subdir]."""

    def __init__(self, subdir: str = "") -> None:
        self.dir = FIXTURES_ROOT / subdir if subdir else FIXTURES_ROOT

    def load(self, key: str) -> Optional[dict[str, Any]]:
        path = self.dir / f"{key}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text())

    def save(self, key: str, result: dict[str, Any]) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / f"{key}.json").write_text(json.dumps(result, indent=2) + "\n")
