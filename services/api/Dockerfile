# Meridian API (FastAPI) — built with uv, served by uvicorn.
# Build context is services/api (this directory), so the image is self-contained and
# does not depend on the rest of the monorepo.
FROM python:3.12-slim

# uv: fast, reproducible installs from the committed uv.lock.
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install dependencies first (cached) using only the lockfile + manifest.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Then the application code.
COPY app ./app

# Railway injects $PORT; default to 8080 for local `docker run`.
ENV PORT=8080
EXPOSE 8080

# Bind 0.0.0.0 so the container is reachable; honor Railway's $PORT.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
