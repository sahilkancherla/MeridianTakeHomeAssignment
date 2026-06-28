"""Flat model output -> typed EditOp dicts. Port of packages/api/src/chat/normalize.ts.
The model returns the loose, all-optional patch shape (friendliest for structured
outputs); this turns it into the precise op shape validate/apply rely on.
"""
from __future__ import annotations

from typing import Any, Optional


def _compact(obj: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Strip None/null so we get a clean partial object."""
    return {k: v for k, v in (obj or {}).items() if v is not None}


def _to_new_card(temp_id: str, fields: Optional[dict[str, Any]]) -> dict[str, Any]:
    f = _compact(fields)
    ctype = f.get("type", "action")
    card: dict[str, Any] = {"tempId": temp_id, "type": ctype, "label": f.get("label", ""), **f}

    if ctype == "branch":
        labels_raw = [str(x) for x in card["branches"]] if isinstance(card.get("branches"), list) else []
        conds_raw = (
            [str(x) for x in card["branchConditions"]]
            if isinstance(card.get("branchConditions"), list) else []
        )
        labels = labels_raw if len(labels_raw) >= 2 else ["Yes", "No"]
        card["branches"] = [
            {"label": label, "condition": conds_raw[i] if i < len(conds_raw) else ""}
            for i, label in enumerate(labels)
        ]
        card.pop("branchConditions", None)
    if ctype == "outcome":
        card["terminal"] = True
    if ctype == "input" and card.get("required") is None:
        card["required"] = True
    return card


def normalize_ops(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ops: list[dict[str, Any]] = []
    for r in raw:
        op = r.get("op")
        if op == "add_card":
            ops.append({"op": "add_card", "card": _to_new_card(r.get("tempId") or "", r.get("card"))})
        elif op == "update_card":
            if r.get("cardId"):
                ops.append({"op": "update_card", "cardId": r["cardId"], "patch": _compact(r.get("card"))})
        elif op == "delete_card":
            if r.get("cardId"):
                ops.append({"op": "delete_card", "cardId": r["cardId"]})
        elif op == "add_edge":
            e = _compact(r.get("edge"))
            edge = {
                **e,
                "source": e.get("source", ""),
                "target": e.get("target", ""),
                "kind": e.get("kind", "flow"),
                **({"tempId": r["tempId"]} if r.get("tempId") else {}),
            }
            ops.append({"op": "add_edge", "edge": edge})
        elif op == "update_edge":
            if r.get("edgeId"):
                ops.append({"op": "update_edge", "edgeId": r["edgeId"], "patch": _compact(r.get("edge"))})
        elif op == "delete_edge":
            if r.get("edgeId"):
                ops.append({"op": "delete_edge", "edgeId": r["edgeId"]})
    return ops
