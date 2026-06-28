"""Runtime config, read from the repo-root .env (the same file the TS server used).

The service runs from services/api, so we point dotenv at the monorepo root explicitly
and expose the AI mode/model knobs the orchestrators read. Mirrors the env contract in
.env.example (ANTHROPIC_API_KEY, AI_REVIEW_MODE/MODEL, AI_EDIT_MODE/MODEL, PORT).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# In local dev the secrets live in the monorepo-root .env. Walk up from this file and
# load the first .env we find (repo root, when running from services/api). In a
# container/Railway deploy there is no .env on disk and real environment variables are
# injected directly — the loop simply finds nothing and is a harmless no-op (the old
# fixed `parents[3]` assumed the monorepo layout and IndexError'd when the code was
# copied to a shallower path).
for _parent in Path(__file__).resolve().parents:
    _candidate = _parent / ".env"
    if _candidate.is_file():
        load_dotenv(_candidate)
        break

DEFAULT_MODEL = "claude-sonnet-4-5"


def port() -> int:
    return int(os.environ.get("PORT", "8787"))


def review_mode() -> str:
    return os.environ.get("AI_REVIEW_MODE") or "mock"


def review_model() -> str:
    return os.environ.get("AI_REVIEW_MODEL") or DEFAULT_MODEL


def edit_mode() -> str:
    return os.environ.get("AI_EDIT_MODE") or "mock"


def edit_model() -> str:
    return os.environ.get("AI_EDIT_MODEL") or os.environ.get("AI_REVIEW_MODEL") or DEFAULT_MODEL
