"""Shared Anthropic helpers used by every AI endpoint (review, chat). Keeps the
model-specific quirks in one place. Port of packages/api/src/llm.ts.
"""
from __future__ import annotations

import math
import re
from typing import Any

_LEGACY_THINKING = re.compile(r"(sonnet|opus)-4-5|opus-4-(0|1)|sonnet-4-0")


def thinking_for(model: str, max_tokens: int) -> dict[str, Any]:
    """Extended-thinking config, chosen by model. Newer models take {'type': 'adaptive'};
    older ones (claude-sonnet-4-5 etc.) only support the legacy budget_tokens form."""
    if _LEGACY_THINKING.search(model):
        return {"type": "enabled", "budget_tokens": math.floor(max_tokens / 2)}
    return {"type": "adaptive"}
