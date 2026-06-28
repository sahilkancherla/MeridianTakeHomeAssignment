"""Offline chat — zero-config, no API key, no network. Routes the message with simple
heuristics into either an answer or a small, VALID proposal. Port of
packages/api/src/chat/mock.ts. Default 'mock' mode; switch AI_EDIT_MODE for the model.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from ..models import ChatRequest
from ..spec.process_graph import analyze
from .schema import ChatOutput

QUESTION_RE = re.compile(
    r"^(what|how|why|when|where|which|who|is|are|does|do|can|could|should|will|list|show|tell)\b",
    re.IGNORECASE,
)


def mock_chat(req: ChatRequest) -> ChatOutput:
    graph = analyze(req.cards, req.edges)
    msg = req.message.strip()
    lower = msg.lower()

    # ---- Questions: answer from the live graph -----------------------------
    if QUESTION_RE.search(lower) or lower.endswith("?"):
        return ChatOutput(kind="chat", text=_answer(req, graph), ops=[])

    # ---- Delete: "remove/delete the <label>" -------------------------------
    if re.search(r"\b(delete|remove|drop)\b", lower):
        target = next((c for c in req.cards if c.label and c.label.lower() in lower), None)
        if target:
            return ChatOutput(
                kind="proposal",
                text=f'Remove the "{target.label}" card.',
                ops=[{"op": "delete_card", "cardId": target.id}],
            )
        return ChatOutput(
            kind="chat", text="I couldn't tell which card to remove — what's its label?", ops=[]
        )

    # ---- Add an exception path (the canonical demo) -------------------------
    if "exception" in lower or "missing" in lower or "discrepan" in lower:
        subject = _after_keyword(msg, ["for", "when", "if"]) or "a problem is found"
        card = {
            "type": "exception",
            "label": _capitalize(_truncate(subject, 48)),
            "condition": subject,
        }
        ops: list[dict[str, Any]] = [{"op": "add_card", "tempId": "new_1", "card": card}]
        open_branch = _first_unrouted_branch(graph)
        if open_branch:
            ops.append({
                "op": "add_edge",
                "edge": {
                    "source": open_branch["cardId"],
                    "target": "new_1",
                    "branchLabel": open_branch["label"],
                    "kind": "exception",
                },
            })
        where = f' off the "{open_branch["label"]}" branch' if open_branch else ""
        return ChatOutput(
            kind="proposal", text=f"Add an Exception for {_truncate(subject, 40)}{where}.", ops=ops
        )

    # ---- Add a rule --------------------------------------------------------
    if "rule" in lower or lower.startswith("require") or "must " in lower:
        text = _after_keyword(msg, ["that", "require", "rule"]) or msg
        card = {"type": "rule", "label": _capitalize(_truncate(text, 40)), "expression": text}
        return ChatOutput(
            kind="proposal",
            text=f"Add a Rule: {_truncate(text, 50)}.",
            ops=[{"op": "add_card", "tempId": "new_1", "card": card}],
        )

    # ---- Add an outcome ----------------------------------------------------
    if "outcome" in lower or "end " in lower or "terminal" in lower:
        text = _after_keyword(msg, ["outcome", "state", "called"]) or "Done"
        card = {"type": "outcome", "label": _capitalize(_truncate(text, 40)), "disposition": text}
        return ChatOutput(
            kind="proposal",
            text=f'Add an Outcome "{_truncate(text, 40)}".',
            ops=[{"op": "add_card", "tempId": "new_1", "card": card}],
        )

    # ---- Fallback: add a generic action ------------------------------------
    if re.search(r"\b(add|create|insert|make)\b", lower):
        text = _after_keyword(msg, ["add", "create", "a", "an"]) or msg
        card = {"type": "action", "label": _capitalize(_truncate(text, 40))}
        return ChatOutput(
            kind="proposal",
            text=f'Add an Action "{_truncate(text, 40)}".',
            ops=[{"op": "add_card", "tempId": "new_1", "card": card}],
        )

    # ---- Otherwise: treat as a question ------------------------------------
    return ChatOutput(kind="chat", text=_answer(req, graph), ops=[])


def _answer(req: ChatRequest, graph: dict[str, Any]) -> str:
    entry = None
    if graph["entry"]:
        entry = next((c.label for c in req.cards if c.id == graph["entry"]), None)
    lines = [
        f'"{req.processName}" has {len(req.cards)} cards and {len(req.edges)} connections.',
        f'It starts at the trigger "{entry}".' if entry else "It has no single trigger yet.",
    ]
    findings = graph["findings"]
    if findings:
        n = len(findings)
        lines.append(
            f"I see {n} open structural gap{'' if n == 1 else 's'} — e.g. {findings[0]['detail']}"
        )
    lines.append(
        "(Offline mode: ask me to add/remove cards and I’ll propose an edit you can preview.)"
    )
    return " ".join(lines)


def _first_unrouted_branch(graph: dict[str, Any]) -> Optional[dict[str, str]]:
    for b in graph["branches"]:
        open_path = next((p for p in b["paths"] if p["targetId"] is None), None)
        if open_path:
            return {"cardId": b["cardId"], "label": open_path["label"]}
    # Else hang it off any branch's last path.
    branch = next((c for c in graph["cards"] if c.type == "branch"), None)
    if branch and branch.branches:
        last = branch.branches[-1]
        label = last.get("label") if isinstance(last, dict) else str(last)
        return {"cardId": branch.id, "label": label}
    return None


def _after_keyword(text: str, keywords: list[str]) -> Optional[str]:
    lower = text.lower()
    for k in keywords:
        i = lower.find(f" {k} ")
        if i >= 0:
            return re.sub(r"[.?!]+$", "", text[i + len(k) + 2:].strip())
    return None


def _truncate(s: str, n: int) -> str:
    return (s[: n - 1].rstrip() + "…") if len(s) > n else s


def _capitalize(s: str) -> str:
    return s[0].upper() + s[1:] if s else s
