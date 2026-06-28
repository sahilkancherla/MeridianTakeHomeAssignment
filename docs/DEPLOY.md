# Deploying to Railway

The two runtime pieces deploy as **two services** in **one Railway project**:

| Service | Dockerfile (repo root) | Build context | Listens on | Public? |
| ------- | ---------------------- | ------------- | ---------- | ------- |
| `api`   | `Dockerfile.api`       | repo root     | `$PORT`    | yes     |
| `web`   | `Dockerfile.web`       | repo root     | `$PORT`    | yes     |

> **Why both build from the repo root.** `railway up` always uploads the **git-repo
> root** as the Docker build context (it ignores the working directory). So both
> Dockerfiles live at the root and reference their sources by path (`Dockerfile.api`
> COPYs from `services/api/`; `Dockerfile.web` builds the pnpm workspace and needs the
> `@meridian/spec` package). Each service selects its Dockerfile with the
> **`RAILWAY_DOCKERFILE_PATH`** service variable — that's what disambiguates them.
>
> `services/api/Dockerfile` also exists as a **self-contained** image for local
> `docker build services/api`; Railway uses `Dockerfile.api` instead.

Supabase stays as-is (already hosted; the browser talks to it directly, the API doesn't).
The only cross-service link is the browser → API call, wired by `VITE_API_BASE_URL`
(inlined into the web bundle at build time). The API's CORS is `*`, and
`ANTHROPIC_API_KEY` lives only on the API.

> **Order matters:** deploy `api` first so its public URL exists, then build `web` with
> `VITE_API_BASE_URL` pointing at it.

---

## Environment variables

### `api` service

| Var                       | Value                                   | Notes |
| ------------------------- | --------------------------------------- | ----- |
| `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.api`                        | selects the API image |
| `ANTHROPIC_API_KEY`       | your key                                | required when modes are `live` |
| `AI_REVIEW_MODE`          | `live` (or `mock`)                      | `mock` runs offline, no key |
| `AI_REVIEW_MODEL`         | `claude-sonnet-4-5`                     | |
| `AI_EDIT_MODE`            | `live` (or `mock`)                      | |
| `AI_EDIT_MODEL`           | `claude-sonnet-4-5`                     | |

`PORT` is injected by Railway — do **not** set it.

### `web` service

`VITE_*` are inlined at **build** time, so changing one requires a **rebuild/redeploy** of `web`.

| Var                       | Value                                          |
| ------------------------- | ---------------------------------------------- |
| `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.web`                               |
| `VITE_API_BASE_URL`       | the `api` service's public URL                 |
| `VITE_SUPABASE_URL`       | your Supabase project URL                      |
| `VITE_SUPABASE_ANON_KEY`  | your Supabase anon key (public, RLS-protected) |

---

## Option A — Railway CLI

```bash
npm i -g @railway/cli
railway login                      # interactive (browser)

# from the repo root:
railway init --name meridian

# --- API ---
railway add --service api
railway variables --service api \
  --set RAILWAY_DOCKERFILE_PATH=Dockerfile.api \
  --set ANTHROPIC_API_KEY=sk-ant-... \
  --set AI_REVIEW_MODE=live --set AI_REVIEW_MODEL=claude-sonnet-4-5 \
  --set AI_EDIT_MODE=live   --set AI_EDIT_MODEL=claude-sonnet-4-5
railway up --service api --ci      # builds Dockerfile.api from the repo root
railway domain --service api       # -> https://api-xxxx.up.railway.app  (copy this)

# --- WEB --- (VITE_API_BASE_URL = the api domain above)
railway add --service web
railway variables --service web \
  --set RAILWAY_DOCKERFILE_PATH=Dockerfile.web \
  --set VITE_API_BASE_URL=https://api-xxxx.up.railway.app \
  --set VITE_SUPABASE_URL=https://YOUR.supabase.co \
  --set VITE_SUPABASE_ANON_KEY=eyJ...
railway up --service web --ci
railway domain --service web       # -> the URL you open
```

> `railway up` reads `RAILWAY_DOCKERFILE_PATH` to choose the Dockerfile, so **always run
> it from the repo root** (the uploaded context). Do not pass a subdirectory path —
> `railway up services/api` fails with "prefix not found".

## Option B — GitHub-connected (no CLI)

1. Push the repo to GitHub; in Railway: **New Project → Deploy from GitHub repo**.
2. Create **two services** from the same repo, both with **Root Directory = repo root**.
3. On each service set the variables above, including `RAILWAY_DOCKERFILE_PATH`
   (`Dockerfile.api` / `Dockerfile.web`). Railway honors that var in the GitHub flow too.
4. Set `web`'s `VITE_API_BASE_URL` to the `api` domain, then redeploy `web`.
5. Generate public domains for both (Settings → Networking → Generate Domain).

---

## Verifying

```bash
curl https://api-xxxx.up.railway.app/health          # -> {"ok": true}
```

Open the `web` domain, sign in, and run **Run AI Review** / open the **AI Editor**. If
those fail with a network/CORS error, the cause is almost always a stale/missing
`VITE_API_BASE_URL` in the `web` build — fix the variable and redeploy `web`.

## Local Docker smoke test (optional)

```bash
# API (self-contained image, services/api context)
docker build -t meridian-api services/api
docker run --rm -e PORT=8080 -e AI_REVIEW_MODE=mock -e AI_EDIT_MODE=mock -p 8080:8080 meridian-api
curl localhost:8080/health

# Web (repo-root context)
docker build -f Dockerfile.web -t meridian-web \
  --build-arg VITE_API_BASE_URL=http://localhost:8080 \
  --build-arg VITE_SUPABASE_URL=https://YOUR.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... .
docker run --rm -e PORT=8081 -p 8081:8081 meridian-web   # open http://localhost:8081
```

## Note: web type-check is currently broken

`Dockerfile.web` builds with `vite build` directly, **not** the package's `build` script
(`tsc --noEmit && vite build`). The repo has an in-progress primitive rename
(`decision` → `branch`/`exception`) that fails the `tsc` gate but does not affect the
bundle (dev and `vite build` both transpile without type-checking). Once those type
errors are resolved, switch `Dockerfile.web` back to `pnpm --filter @meridian/web build`
so the image build also type-checks.
