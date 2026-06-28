"""Edit-op helpers used by the chat pipeline. Port of the parts of
packages/spec/src/edit-ops.ts the API needs: validate_ops + summarize_ops.

applyOps is intentionally NOT ported — confirm/discard/undo run client-side. Ops are
plain dicts here (the same loose shape normalize.py produces), mirroring the JS objects.
"""
from __future__ import annotations

from typing import Any

from .primitives import PRIMITIVE_TYPES, Card, Edge

EditOp = dict[str, Any]


# ---------------------------------------------------------------------------
# summarize_ops — the "+2 cards, +3 edges, 1 edit" banner text
# ---------------------------------------------------------------------------

def summarize_ops(ops: list[EditOp]) -> str:
    add_c = del_c = upd_c = add_e = del_e = upd_e = 0
    for o in ops:
        op = o["op"]
        if op == "add_card":
            add_c += 1
        elif op == "delete_card":
            del_c += 1
        elif op == "update_card":
            upd_c += 1
        elif op == "add_edge":
            add_e += 1
        elif op == "delete_edge":
            del_e += 1
        elif op == "update_edge":
            upd_e += 1

    parts: list[str] = []
    if add_c:
        parts.append(f"+{add_c} card{'' if add_c == 1 else 's'}")
    if del_c:
        parts.append(f"−{del_c} card{'' if del_c == 1 else 's'}")
    if add_e:
        parts.append(f"+{add_e} edge{'' if add_e == 1 else 's'}")
    if del_e:
        parts.append(f"−{del_e} edge{'' if del_e == 1 else 's'}")
    edits = upd_c + upd_e
    if edits:
        parts.append(f"{edits} edit{'' if edits == 1 else 's'}")
    return ", ".join(parts) or "no changes"


# ---------------------------------------------------------------------------
# validate_ops — referential integrity, before a proposal is ever shown
# ---------------------------------------------------------------------------

def validate_ops(cards: list[Card], edges: list[Edge], ops: list[EditOp]) -> dict[str, Any]:
    errors: list[str] = []
    card_ids = {c.id for c in cards}
    edge_ids = {e.id for e in edges}

    # Temp ids introduced by add_card in THIS proposal.
    temp_ids: set[str] = set()
    for o in ops:
        if o["op"] != "add_card":
            continue
        t = (o.get("card") or {}).get("tempId")
        if not t:
            errors.append("An add_card op is missing its tempId.")
        elif t in temp_ids or t in card_ids:
            errors.append(f'Duplicate card id "{t}".')
        else:
            temp_ids.add(t)

    def resolvable(cid: str) -> bool:
        return cid in card_ids or cid in temp_ids

    for o in ops:
        op = o["op"]
        if op == "add_card":
            card = o.get("card") or {}
            ctype = card.get("type")
            if not ctype or ctype not in PRIMITIVE_TYPES:
                errors.append(f'add_card "{card.get("tempId")}" has an unknown type "{ctype}".')
            if ctype == "branch":
                branches = card.get("branches")
                if not isinstance(branches, list) or len(branches) < 2:
                    errors.append(
                        f'Branch "{card.get("tempId")}" needs at least two conditional paths.'
                    )
        elif op in ("update_card", "delete_card"):
            if not resolvable(o.get("cardId", "")):
                errors.append(f'{op} references unknown card "{o.get("cardId")}".')
        elif op == "add_edge":
            edge = o.get("edge") or {}
            if not resolvable(edge.get("source", "")):
                errors.append(f'add_edge source "{edge.get("source")}" does not exist.')
            if not resolvable(edge.get("target", "")):
                errors.append(f'add_edge target "{edge.get("target")}" does not exist.')
        elif op in ("update_edge", "delete_edge"):
            if o.get("edgeId") not in edge_ids:
                errors.append(f'{op} references unknown edge "{o.get("edgeId")}".')

    return {"ok": len(errors) == 0, "errors": errors}
