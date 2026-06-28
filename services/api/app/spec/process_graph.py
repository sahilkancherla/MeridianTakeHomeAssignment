"""analyze() — the pure ProcessGraph transform. Port of packages/spec/src/process-graph.ts.

A faithful, heuristic-for-heuristic port: the mock review/chat paths derive their output
from these findings/facts, so any divergence from the TS implementation changes what a
fresh `mock`-mode clone produces. The JS-specific behaviours are reproduced deliberately
(first-occurrence string replace, half-up rounding, finding ordering). Parity is locked in
by tests/test_spec_parity.py against golden snapshots from the TS analyze().
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional

from .primitives import Card, Edge

# Card types that participate in control flow (so reachability applies to them).
FLOW_TYPES = {"action", "rule", "branch", "exception", "outcome"}

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "be", "all",
    "both", "within", "into", "for", "with", "that", "this", "it", "its", "their",
    "them", "must", "should", "when", "where", "which", "what", "how", "do", "does",
    "did", "has", "have", "had", "was", "were", "not", "no", "yes", "any", "each",
    "from", "by", "as", "at", "if", "then", "else", "every",
}

_DOTTED_RE = re.compile(r"\b([a-z][a-z0-9_]*)\.[a-z0-9_.]+", re.IGNORECASE)


def js_round(value: float) -> float:
    """JS Math.round: round half UP (not Python's banker's rounding)."""
    return math.floor(value + 0.5)


# ---------------------------------------------------------------------------
# analyze() — the pure transform
# ---------------------------------------------------------------------------

def analyze(
    cards: list[Card],
    edges: list[Edge],
    annotations: Optional[list[dict[str, Any]]] = None,
    open_comments: int = 0,
) -> dict[str, Any]:
    by_id = {c.id: c for c in cards}
    valid_edges = [e for e in edges if e.source in by_id and e.target in by_id]

    triggers = [c for c in cards if c.type == "trigger"]
    entry = triggers[0].id if len(triggers) == 1 else None
    terminals = [c.id for c in cards if c.type == "outcome"]

    branches = _normalize_branches(cards, valid_edges)
    facts = _extract_facts(cards)
    reachable = _compute_reachable(entry, valid_edges)

    findings = _collect_findings(cards, valid_edges, triggers, entry, branches, facts, reachable)
    completeness = _score_completeness(cards, findings, open_comments)

    return {
        "cards": cards,
        "edges": edges,
        "entry": entry,
        "terminals": terminals,
        "branches": branches,
        "facts": facts,
        "findings": findings,
        "annotations": annotations or [],
        "completeness": completeness,
    }


# ---------------------------------------------------------------------------
# Branch normalization
# ---------------------------------------------------------------------------

def _normalize_branches(cards: list[Card], edges: list[Edge]) -> list[dict[str, Any]]:
    def target_of(card_id: str, label: str) -> Optional[str]:
        for e in edges:
            if e.source == card_id and e.branchLabel == label:
                return e.target
        return None

    out: list[dict[str, Any]] = []
    for c in cards:
        if c.type == "branch":
            paths = c.branches or []
            out.append({
                "cardId": c.id,
                "question": c.label,
                "paths": [
                    {
                        "label": p.get("label"),
                        "condition": p.get("condition"),
                        "targetId": target_of(c.id, p.get("label")),
                    }
                    for p in paths
                ],
            })
    return out


# ---------------------------------------------------------------------------
# Reachability — over all edges (a card reached via an exception edge is reached)
# ---------------------------------------------------------------------------

def _compute_reachable(entry: Optional[str], edges: list[Edge]) -> set[str]:
    reachable: set[str] = set()
    if not entry:
        return reachable
    adj: dict[str, list[str]] = {}
    for e in edges:
        adj.setdefault(e.source, []).append(e.target)
    queue = [entry]
    reachable.add(entry)
    while queue:
        node = queue.pop(0)
        for nxt in adj.get(node, []):
            if nxt not in reachable:
                reachable.add(nxt)
                queue.append(nxt)
    return reachable


# ---------------------------------------------------------------------------
# The data-flow / facts model — heuristic-light, AI-confirmed
# ---------------------------------------------------------------------------

def _normalize_name(s: str) -> str:
    x = s.lower()
    x = re.sub(r"[^a-z0-9]+", "_", x)
    x = re.sub(r"^_+|_+$", "", x)
    x = re.sub(r"_+", "_", x)
    return x


def _tokens(name: str) -> list[str]:
    return [t for t in name.split("_") if t]


def _names_related(a: str, b: str) -> bool:
    if a == b:
        return True
    ta = set(_tokens(a))
    tb = set(_tokens(b))
    if not ta or not tb:
        return False
    small, big = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    return all(t in big for t in small)


def _extract_references(text: str) -> list[str]:
    if not text:
        return []
    refs: list[str] = []

    def add(r: str) -> None:
        if r not in refs:
            refs.append(r)

    rest = text
    for m in _DOTTED_RE.finditer(text):
        add(_normalize_name(m.group(1)))
        rest = rest.replace(m.group(0), " ", 1)  # JS String.replace: first occurrence only

    run: list[str] = []

    def flush() -> None:
        nonlocal run
        if run:
            add("_".join(run))
        run = []

    for raw in re.split(r"[^a-z0-9]+", rest.lower()):
        if not raw or len(raw) < 3 or raw in STOPWORDS:
            flush()
        else:
            run.append(raw)
    flush()
    return refs


def _extract_facts(cards: list[Card]) -> list[dict[str, Any]]:
    facts: dict[str, dict[str, Any]] = {}

    def ensure(name: str, label: str) -> dict[str, Any]:
        f = facts.get(name)
        if f is None:
            f = {"name": name, "label": label, "producedBy": [], "consumedBy": []}
            facts[name] = f
        return f

    # Inputs and Actions ESTABLISH information. When the card DECLARES its data fields
    # (Input.fields / Action.produces), those are authoritative — one fact per declared
    # field. Otherwise fall back to the label-as-single-fact heuristic.
    for c in cards:
        if c.type not in ("input", "action"):
            continue
        declared = c.fields if c.type == "input" else c.produces
        if declared:
            for field in declared:
                name = _normalize_name(field.get("name", "") if isinstance(field, dict) else "")
                if name:
                    ensure(name, field.get("name", ""))["producedBy"].append(c.id)
        else:
            name = _normalize_name(c.label)
            if name:
                ensure(name, c.label)["producedBy"].append(c.id)

    # Rules and Branches USE information.
    for c in cards:
        if c.type == "rule":
            texts = [c.expression or ""]
        elif c.type == "branch":
            texts = [(p.get("condition") or "") for p in (c.branches or [])]
        else:
            continue

        for text in texts:
            for ref in _extract_references(text):
                producer = next(
                    (f for f in facts.values() if f["producedBy"] and _names_related(f["name"], ref)),
                    None,
                )
                fact = producer if producer is not None else ensure(ref, ref.replace("_", " "))
                if c.id not in fact["consumedBy"]:
                    fact["consumedBy"].append(c.id)

    return list(facts.values())


# ---------------------------------------------------------------------------
# Deterministic findings
# ---------------------------------------------------------------------------

def _collect_findings(
    cards: list[Card],
    edges: list[Edge],
    triggers: list[Card],
    entry: Optional[str],
    branches: list[dict[str, Any]],
    facts: list[dict[str, Any]],
    reachable: set[str],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def add(kind: str, card_id: Optional[str], detail: str) -> None:
        out.append({"kind": kind, "cardId": card_id, "detail": detail})

    # Trigger cardinality.
    if len(triggers) == 0:
        add("no_trigger", None, "No Trigger — the process has no defined starting event.")
    if len(triggers) > 1:
        for t in triggers:
            add("multiple_triggers", t.id,
                f'More than one Trigger ("{t.label}") — a process should have a single entry point.')

    # Reachability (only over flow-participating cards).
    if entry:
        for c in cards:
            if c.id == entry or c.type not in FLOW_TYPES:
                continue
            if c.id not in reachable:
                add("unreachable_card", c.id, f'"{c.label}" cannot be reached from the Trigger.')
        for c in cards:
            if c.type == "outcome" and c.id not in reachable:
                add("outcome_unreachable", c.id,
                    f'Outcome "{c.label}" is never reached — no path leads to it.')

    # Branch paths without a target.
    for b in branches:
        for p in b["paths"]:
            if p["targetId"] is None:
                add("missing_branch_path", b["cardId"],
                    f'Branch "{b["question"] or b["cardId"]}" has a "{p["label"]}" path with no '
                    "target — what happens then?")

    # Exceptions that describe a problem but no recovery.
    for c in cards:
        if c.type == "exception" and not any(e.source == c.id for e in edges):
            add("dangling_exception", c.id,
                f'Exception "{c.label}" has no outgoing path — what should happen when it occurs?')

    # Actions not linked to a System.
    for c in cards:
        if c.type == "action" and not c.systemId:
            add("action_without_system", c.id,
                f'Action "{c.label}" isn\'t linked to a System — where does it run?')

    # Flow cycles (exception edges are allowed to loop; flow edges are not).
    for cid in _detect_flow_cycle(cards, edges):
        add("flow_cycle", cid,
            "This card is part of a flow cycle — loops should be drawn as Exception edges.")

    # Referenced-but-never-established facts (the high-value data-flow gap).
    for f in facts:
        if f["consumedBy"] and not f["producedBy"]:
            add("fact_never_produced", (f["consumedBy"][0] if f["consumedBy"] else None),
                f'"{f["label"]}" is used but never established — no step produces it. '
                "Where does this data come from?")

    return out


def _detect_flow_cycle(cards: list[Card], edges: list[Edge]) -> list[str]:
    """Card ids that lie on at least one cycle made of `flow` edges (insertion-ordered)."""
    flow = [e for e in edges if e.kind == "flow"]
    adj: dict[str, list[str]] = {}
    for e in flow:
        adj.setdefault(e.source, []).append(e.target)

    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {c.id: WHITE for c in cards}
    on_cycle: list[str] = []
    on_cycle_set: set[str] = set()
    stack: list[str] = []

    def mark(cid: str) -> None:
        if cid not in on_cycle_set:
            on_cycle_set.add(cid)
            on_cycle.append(cid)

    def visit(node: str) -> None:
        color[node] = GRAY
        stack.append(node)
        for nxt in adj.get(node, []):
            if color.get(nxt) == GRAY:
                # back-edge: everything from `nxt` up the stack is on the cycle.
                frm = _last_index(stack, nxt)
                if frm >= 0:
                    for cid in stack[frm:]:
                        mark(cid)
            elif color.get(nxt) == WHITE:
                visit(nxt)
        stack.pop()
        color[node] = BLACK

    for c in cards:
        if color.get(c.id) == WHITE:
            visit(c.id)
    return on_cycle


def _last_index(seq: list[str], value: str) -> int:
    for i in range(len(seq) - 1, -1, -1):
        if seq[i] == value:
            return i
    return -1


# ---------------------------------------------------------------------------
# Completeness — a rough, explainable signal
# ---------------------------------------------------------------------------

def _score_completeness(
    cards: list[Card], findings: list[dict[str, Any]], open_comments: int
) -> dict[str, Any]:
    issues = len(findings) + open_comments
    if len(cards) == 0:
        score: float = 0
    else:
        score = js_round((1 - issues / (len(cards) + issues)) * 100) / 100
    return {"score": score, "openFindings": len(findings), "openComments": open_comments}
