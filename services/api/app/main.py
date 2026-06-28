"""The Meridian API server (FastAPI). It owns the server-side Claude calls — AI review
(`/api/review`) and AI canvas editing (`/api/chat`) — so ANTHROPIC_API_KEY stays off
the client. Replaces the former @meridian/api Hono server; the web app's Vite proxy
points `/api` here unchanged (default port 8787).

See docs/design/ai-review-spec.md §2 and whiteboard-spec.md §8.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import edit_mode, edit_model, review_mode, review_model
from .models import ChatRequest, ReviewRequest

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("meridian.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("[api] review: mode=%s, model=%s", review_mode(), review_model())
    log.info("[api] chat:   mode=%s, model=%s", edit_mode(), edit_model())
    yield


app = FastAPI(title="Meridian API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/api/review")
async def review(request: Request) -> JSONResponse:
    """POST /api/review — see docs/design/ai-review-spec.md §1.1, §3."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON body"}, status_code=400)
    if not isinstance(body.get("cards"), list) or not isinstance(body.get("edges"), list):
        return JSONResponse({"error": "request must include cards[] and edges[]"}, status_code=400)
    try:
        req = ReviewRequest.model_validate(body)
    except Exception as e:
        return JSONResponse({"error": f"invalid request: {e}"}, status_code=400)

    from .review.service import run_review
    try:
        return JSONResponse(run_review(req))
    except Exception as e:
        log.exception("review error")
        return JSONResponse({"error": str(e) or "review failed"}, status_code=500)


@app.post("/api/chat")
async def chat(request: Request) -> JSONResponse:
    """POST /api/chat — AI canvas editing (docs/design/whiteboard-spec.md §8). Stateless:
    the client sends the live cards/edges + recent history + the new message; the server
    re-derives the ProcessGraph, asks the model to answer or propose, and returns it."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON body"}, status_code=400)
    if (
        not isinstance(body.get("cards"), list)
        or not isinstance(body.get("edges"), list)
        or not isinstance(body.get("message"), str)
    ):
        return JSONResponse(
            {"error": "request must include cards[], edges[], and a message"}, status_code=400
        )
    if not body["message"].strip():
        return JSONResponse({"error": "message is empty"}, status_code=400)
    if not isinstance(body.get("history"), list):
        body["history"] = []
    try:
        req = ChatRequest.model_validate(body)
    except Exception as e:
        return JSONResponse({"error": f"invalid request: {e}"}, status_code=400)

    from .chat.service import run_chat
    try:
        return JSONResponse(run_chat(req))
    except Exception as e:
        log.exception("chat error")
        return JSONResponse({"error": str(e) or "chat failed"}, status_code=500)
