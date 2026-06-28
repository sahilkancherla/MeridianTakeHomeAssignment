"""Structured-output schema the review model is FORCED to return. Port of
packages/api/src/review/schema.ts. Flat string/enum/array shapes only.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class DraftComment(BaseModel):
    cardId: Optional[str] = None
    category: Literal["missing_info", "ambiguity", "structure", "inconsistency"]
    body: str


class StatusUpdateOut(BaseModel):
    commentId: str
    status: Literal["resolved", "open"]
    note: Optional[str] = None


class AnnotationOut(BaseModel):
    cardId: str
    confidence: Literal["high", "medium", "low"]
    assumptions: list[str]
    ambiguities: list[str]


class ReviewSchema(BaseModel):
    newComments: list[DraftComment]
    statusUpdates: list[StatusUpdateOut]
    annotations: list[AnnotationOut]
