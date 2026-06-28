"""The fixed primitive set + card/edge models. Port of packages/spec/src/primitives.ts.

Cards arrive from the web app as loose JSON. Rather than a strict discriminated union,
we model one permissive Card with every primitive's fields optional (extra fields are
kept) — analyze() reads the fields each type uses, exactly as the TS union does.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

PRIMITIVE_TYPES: list[str] = [
    "trigger",
    "input",
    "system",
    "action",
    "rule",
    "branch",
    "exception",
    "outcome",
]

# Per-primitive plain-language definition (the one-sentence test).
PRIMITIVE_DEFINITIONS: dict[str, str] = {
    "trigger": "The event that starts the process.",
    "input": "A piece of information or file the process needs.",
    "system": "An external tool or place where data lives.",
    "action": "Something a person or the agent does.",
    "rule": "A condition that must be true to continue.",
    "branch": "A point where the path splits, with a condition for each way it can go.",
    "exception": "What to do when something is missing or wrong.",
    "outcome": "A terminal state where the process ends.",
}


class Position(BaseModel):
    model_config = ConfigDict(extra="allow")
    x: float = 0
    y: float = 0


class Card(BaseModel):
    """A whiteboard card. Permissive: known fields are typed, unknown fields preserved."""

    model_config = ConfigDict(extra="allow")

    id: str
    type: str
    label: str = ""
    description: Optional[str] = None
    position: Optional[Position] = None
    context: Optional[dict[str, Any]] = None

    # trigger
    source: Optional[str] = None
    # input
    required: Optional[bool] = None
    format: Optional[str] = None
    fields: Optional[list[Any]] = None  # extraction schema (DataField[])
    # system
    integration: Optional[str] = None  # deprecated; prefer `access`
    access: Optional[str] = None  # plain-language: how the team reaches this system
    secrets: Optional[list[Any]] = None  # SecretRef[] declarations (no values)
    # action
    systemId: Optional[str] = None
    waitDays: Optional[float] = None
    produces: Optional[list[Any]] = None  # data this step establishes (DataField[])
    # rule
    expression: Optional[str] = None
    # branch (branches: list[{label, condition}])
    branches: Optional[list[Any]] = None
    # exception
    condition: Optional[str] = None
    # outcome
    terminal: Optional[bool] = None
    disposition: Optional[str] = None


class Edge(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    source: str
    target: str
    branchLabel: Optional[str] = None
    kind: str = "flow"
