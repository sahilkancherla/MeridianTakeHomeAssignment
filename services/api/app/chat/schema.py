"""The structured output the chat model returns: one object per turn — either a
conversational answer (kind 'chat') or a proposal (kind 'proposal') with a flat op
patch. Port of packages/api/src/chat/schema.ts. The flat ops are normalized into the
typed EditOp shape by normalize.py.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict

OpName = Literal["add_card", "update_card", "delete_card", "add_edge", "update_edge", "delete_edge"]


class EditOpRaw(BaseModel):
    model_config = ConfigDict(extra="allow")

    op: OpName
    tempId: Optional[str] = None
    cardId: Optional[str] = None
    edgeId: Optional[str] = None
    card: Optional[dict[str, Any]] = None
    edge: Optional[dict[str, Any]] = None


class ChatOutput(BaseModel):
    kind: Literal["chat", "proposal"]
    text: str
    ops: list[EditOpRaw] = []
