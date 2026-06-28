"""Wire-contract models — the JSON the web app POSTs and receives. Mirrors the
@meridian/spec types (review.ts, comments.ts, edit-ops.ts). These are the API I/O
boundary; the pure logic in app/spec/ operates on Card/Edge + plain dicts.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict

from .spec.primitives import Card, Edge

CommentStatus = Literal["open", "answered", "rejected", "resolved"]
CommentCategory = Literal["missing_info", "ambiguity", "structure", "inconsistency"]


class Comment(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    processId: str
    cardId: Optional[str] = None
    author: Literal["ai", "user"]
    authorEmail: Optional[str] = None
    body: str
    status: CommentStatus
    category: Optional[CommentCategory] = None
    parentId: Optional[str] = None
    createdAt: str
    updatedAt: str


class Annotation(BaseModel):
    model_config = ConfigDict(extra="allow")

    cardId: str
    confidence: Literal["high", "medium", "low"]
    assumptions: list[str] = []
    ambiguities: list[str] = []


class StatusUpdate(BaseModel):
    commentId: str
    status: Literal["resolved", "open"]
    note: Optional[str] = None


# --- /api/review ------------------------------------------------------------

class ReviewRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    processName: str
    round: int
    cards: list[Card] = []
    edges: list[Edge] = []
    comments: list[Comment] = []
    annotations: list[Annotation] = []


class ReviewResult(BaseModel):
    reviewRound: int
    newComments: list[Comment]
    statusUpdates: list[StatusUpdate]
    annotations: list[Annotation]


# --- /api/chat --------------------------------------------------------------

class ProposedChange(BaseModel):
    id: str
    prompt: str
    summary: str
    ops: list[dict[str, Any]]
    status: str
    createdAt: str


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    role: Literal["user", "assistant"]
    kind: Literal["chat", "proposal"]
    content: str
    proposal: Optional[ProposedChange] = None
    createdAt: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    processName: str
    cards: list[Card] = []
    edges: list[Edge] = []
    history: list[ChatMessage] = []
    message: str
