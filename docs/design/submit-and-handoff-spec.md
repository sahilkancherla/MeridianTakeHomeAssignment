# Revision Loop, Submit → Frozen Spec, and the Customer ↔ Engineer Handoff

> Status: **Built** (this doc is the as-implemented spec; §8 tracks the delta)
> Owner: Sahil Kancherla
> Last updated: 2026-06-27
> Brief: [`../project-overview.md`](../project-overview.md) ·
> Siblings: [`whiteboard-spec.md`](./whiteboard-spec.md) · [`ai-review-spec.md`](./ai-review-spec.md)

This doc closes the loop on **Task 1c (revision loop)** and **Task 1d (submit → frozen
spec)** and adds the dimension that turns the single-user prototype into a real
two-sided product: an **enterprise customer** captures and submits a process; an
**internal Meridian engineer** receives the frozen spec and builds the agent from it.

It is grounded in what is **already built**. Where a behaviour exists today, this doc
says so and references the file; where it changes, it says what changes and why. The
goal is the smallest robust delta from the current code, not a rewrite.

---

## 0. What already exists (the baseline)

| Area | State today | File(s) |
|------|-------------|---------|
| **Revision loop** | **Built end-to-end.** AI review leaves Figma-style comments; `open → answered → resolved/rejected` lifecycle; reply/reject; AI re-review auto-resolves; pins + panel + filters. | `ai-review-spec.md`, `web/src/store/commentStore.ts`, `web/src/board/CommentsPanel.tsx` |
| **Frozen spec object** | **Built.** `buildFrozenSpec()` produces the immutable, content-hashed `FrozenSpec` (cards, edges, analyzed graph, resolved assumptions, outcomes). | `spec/src/build-spec.ts`, `spec/src/frozen-spec.ts` |
| **Submit (UI)** | **Preview only.** Topbar `Submit` builds the spec **in memory** and opens `SpecModal` (raw JSON + copy/download). It does **not** persist, version, or change anything. Version is hardcoded to `1`. | `web/src/board/Topbar.tsx:33-35`, `web/src/board/SpecModal.tsx` |
| **Spec persistence (data layer)** | **Built but unused.** `insertFrozenSpec()`, `nextSpecVersion()`, `listFrozenSpecs()` already exist and talk to the append-only `frozen_spec` table — but nothing in the UI calls the insert path. | `web/src/data/processes.ts:287-315` |
| **`frozen_spec` table** | **Built + immutable.** Append-only with `do instead nothing` rules on UPDATE/DELETE; `unique(process_id, version)`. | `supabase/migrations/00000000000001_initial_schema.sql:98-110` |
| **Auth / identity** | **Single-role.** Supabase email+password; every `process` row is owned by `auth.uid()`; RLS scopes everything to the owner. **No role concept, no profiles table.** | `web/src/store/authStore.ts`, `web/src/routes/{LoginPage,RequireAuth}.tsx`, migration `…0003` |

**So the work is three things, in order:**
1. **Finish Submit** — wire the existing persistence path behind a real confirmation, with correct versioning and the gate from `whiteboard-spec.md §11`.
2. **Add roles** — a `profiles` table + role derived from email domain, role-aware routing, and RLS that lets engineers read submitted specs.
3. **Build the two views** — the customer's lock/confirmation/summary, and the engineer's cross-customer spec inbox with a handoff status they can advance.

---

## 1. Roles & identity

### 1.1 Two roles, one login

There is **one** sign-in screen (the existing `LoginPage`). Role is **derived from the
email domain** at signup and stored as the source of truth, so it can be overridden later
without changing the rule:

```
role = email endsWith '@usemeridian.io'  →  'engineer'
                                  else     →  'customer'
```

This is grounded in the assignment itself: Meridian provisions `yourname@usemeridian.io`
inboxes for the team. Anyone signing up with a Meridian address is internal; everyone else
is a customer. The domain rule runs **once**, at profile creation; the stored `role` column
is authoritative thereafter (an admin can flip a row without the email changing).

> **Security note.** The rule runs **server-side in a Postgres trigger** (§1.2), not in the
> browser — the client never asserts its own role. RLS keys off the stored `profiles.role`,
> so a customer cannot read engineer-only data even if they tamper with the SPA.

### 1.2 `profiles` table (new migration)

```sql
create type app_role as enum ('customer', 'engineer');

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          app_role not null default 'customer',
  display_name  text,
  company       text,                     -- shown to the engineer ("Acme Corp")
  created_at    timestamptz not null default now()
);

-- Auto-create a profile when a user signs up; derive role from the email domain.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into profiles (id, role, display_name, company)
  values (
    new.id,
    case when new.email ilike '%@usemeridian.io' then 'engineer'::app_role
         else 'customer'::app_role end,
    split_part(new.email, '@', 1),
    case when new.email ilike '%@usemeridian.io' then 'Meridian (internal)'
         else split_part(new.email, '@', 2) end          -- domain as a stand-in company
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

`company` defaults to the email domain so the engineer's inbox has a human label with zero
extra signup fields. A real onboarding would set it explicitly; the domain is a fine
stand-in for the take-home.

### 1.3 Client: role on the session

`authStore` gains `role` and `profile`, loaded once after the session resolves:

```ts
type AuthState = {
  session: Session | null;
  user: User | null;
  role: 'customer' | 'engineer' | null;   // null until the profile loads
  profile: { displayName: string | null; company: string | null } | null;
  loading: boolean;
  // …signIn / signUp / signOut unchanged
};
```

After `getSession()` resolves (and on `onAuthStateChange`), fetch
`profiles` for `user.id` and set `role`. `RequireAuth` already blocks on `loading`; it now
also waits for `role` so the first paint is correct (no customer-Home flash for an engineer).

### 1.4 Routing by role

```
/login                         → LoginPage (shared)
/                              → role === 'engineer' ? EngineerHome : CustomerHome
/board/:processId             → customer board (existing); engineer access is read-only (§4.4)
/board/:processId/settings    → customer only
/specs                        → EngineerHome list (alias; engineer only)
/specs/:specId                → EngineerSpecDetail (engineer only)
/settings                     → global settings (both roles; engineer sees a trimmed set)
```

A small `<RequireRole role="engineer">` guard wraps engineer-only routes and redirects a
customer to `/`. It reads `authStore.role` — the same value RLS enforces server-side, so
the guard is a UX convenience, not the security boundary.

---

## 2. The revision loop (already built — how it gates Submit)

The revision loop is specified and implemented in
[`ai-review-spec.md`](./ai-review-spec.md); this doc does **not** re-specify it. The only
thing Submit needs from it is the **gate signal**:

- A comment is "blocking" iff `status === 'open'` **and** `author === 'ai'` … *(see §3.4 —
  the gate counts open comments; rejected/answered/resolved never block).*
- `commentStore` already exposes `openCount(comments)`; `Topbar` already reads
  `openComments` for the review button badge. Submit reuses exactly that number.

**The loop is the point of the product** (Task 1c): `open → answered → (re-review) →
resolved`. Submit is the *terminal* of that loop — it should be reachable cleanly when the
loop has converged, and reachable with friction (override + reason) when it hasn't. That is
the entire coupling between the two halves; everything else about comments stays as built.

---

## 3. Submit → frozen spec (finishing the built path)

### 3.1 What Submit must produce

The `FrozenSpec` object is **already correct** (`build-spec.ts`). The gap is everything
*around* it: confirmation, persistence, versioning, status, and the lock. Submit's job:

1. **Build** the spec (`buildFrozenSpec`, as today) — but with the **real version**
   (`nextSpecVersion(processId)`), the live `reviewRound`, and an `overrideReason` if the
   gate was overridden.
2. **Persist** it (`insertFrozenSpec`, already written) — one append-only `frozen_spec` row.
3. **Initialise its handoff status** to `submitted` (§5).
4. **Flip** `process.status → 'submitted'` (insertFrozenSpec already does this).
5. **Lock** the customer's view of *that version* and confirm the handoff.

### 3.2 The data model — what's frozen vs. what's mutable

This is the one genuinely subtle design point. The `FrozenSpec` payload is **immutable** (the
table's `do instead nothing` rules guarantee the artifact a customer submitted never silently
changes — exactly the §11 promise). But the **handoff status** (`submitted → in_build →
deployed`) *must* change as the engineer works. Those two facts can't live in the same row.

**So the status lives in a separate, mutable table keyed by the immutable spec:**

```sql
create type build_status as enum ('submitted', 'in_build', 'deployed');

create table spec_build (
  spec_id     uuid primary key references frozen_spec(spec_id) on delete cascade,
  status      build_status not null default 'submitted',
  updated_by  uuid references auth.users(id),         -- the engineer who advanced it
  updated_at  timestamptz not null default now()
);
```

The frozen artifact stays bit-for-bit immutable; the workflow state sits *alongside* it.
This is the clean way to honour "the spec shouldn't silently change" while still modelling a
handoff that obviously *does* change over time.

> Status is **per spec version** (`spec_id`), not per process. If a customer re-submits while
> the engineer is mid-build, the new version is its own `submitted` row; the old version keeps
> its status. The engineer inbox shows the **latest version per process** by default, history
> on the detail page (§5.2).

### 3.3 The two-tier customer Submit flow

```
Customer clicks Submit
        │
        ▼
┌─ Confirm dialog (customer language) ─────────────────────────┐
│  Submit "Inbound Import Receiving" to your Meridian team?    │
│                                                              │
│  Once you submit, this version is locked and sent to the     │
│  team to build your agent. You can keep editing and submit   │
│  a new version anytime.                                      │
│                                                              │
│  ⚠ 2 comments are still open.  (only when openComments > 0)  │
│     Reason for submitting anyway: [____________________]     │
│                                                              │
│              [ Keep editing ]   [ Submit & lock 🔒 ]         │
└──────────────────────────────────────────────────────────────┘
        │ confirm
        ▼
  build → persist → spec_build(submitted) → process.status='submitted'
        │
        ▼
┌─ Confirmation (success) ─────────────────────────────────────┐
│  🔒  Version 3 locked and sent to your Meridian team.        │
│      They'll start building your agent from this spec.       │
│                              [ View summary ]   [ Done ]     │
└──────────────────────────────────────────────────────────────┘
```

- **No raw JSON for the customer** (per the locked decision). The confirm and success screens
  speak in process-owner language. "View summary" opens the human-readable summary (§4.3).
- **The gate** (`whiteboard-spec.md §11`): if `openComments === 0`, the warning row and reason
  field are hidden and Submit is one click. If `openComments > 0`, the reason field appears and
  is **required** before "Submit & lock" enables — the customer is never hard-blocked, but the
  unresolved ambiguity is captured into `sourceMeta.overrideReason`.
- This replaces the current `previewSpec` handler in `Topbar.tsx`. The raw-JSON `SpecModal`
  is **retired from the customer flow** and reused (read-only) inside the engineer's spec
  detail (§5.3).

### 3.4 Versioning & re-submit

- `version = nextSpecVersion(processId)` (`max(existing)+1`), not the hardcoded `1`. This
  function already exists; Topbar just isn't calling it.
- After submit the board **stays editable** (existing behaviour) — re-submitting builds a new
  version, a new `frozen_spec` row, and a fresh `spec_build` row at `submitted`. Old versions
  and their statuses remain. This is the §11 "snapshot + keep editing" promise, now real.

---

## 4. The enterprise customer experience

### 4.1 Customer Home (`/` for `role==='customer'`)

This is **today's `HomePage`**, essentially unchanged — it already lists the user's
whiteboards with status badge, open-comment count, and last-edited. Two additions:

- A submitted card shows the **lock + handoff status** from `spec_build` on its latest version:
  `🔒 v3 · Sent to team` / `🔒 v3 · Building…` / `🔒 v3 · Deployed`. (One extra grouped query
  alongside the existing `latestVersions()` aggregate — same N+1-avoiding pattern.)
- Copy stays customer-facing ("Your whiteboards", "Map a business process…").

### 4.2 The board & Submit

Unchanged except the Topbar Submit handler (§3.3). The completeness chip, AI review, AI editor,
inspector, comments — all as built.

### 4.3 Post-submit: lock + friendly summary (no JSON)

A customer-facing `SpecSummary` view (replaces the raw `SpecModal` for this role). It renders
the `FrozenSpec` as **plain language**, derived entirely from fields the object already carries:

```
🔒  Inbound Import Receiving — Version 3
    Sent to your Meridian team · Building…            ← spec_build.status

WHAT YOU SUBMITTED
  • Starts when:   an email from an exporter arrives        ← trigger card
  • 12 steps, 3 decisions, 2 possible outcomes              ← cards / branches / outcomes
  • Ends in:       Shipment approved · Shipment held        ← outcomes[].disposition

ASSUMPTIONS WE RESOLVED TOGETHER (5)                        ← resolvedAssumptions[]
  • "Required docs must be consistent" → on PO number, qty, and net weight
  • COA missing → email the exporter, hold up to 3 business days
  • …

This version is locked. You can keep editing the whiteboard and submit a new
version anytime — your team always builds from the version you submitted.
```

Everything here reads off `spec.cards`, `spec.outcomes`, `spec.graph.branches`, and
`spec.resolvedAssumptions` — no new data, just a non-technical projection of the same object
the engineer sees as JSON. **The customer never sees `findings`, `facts`, confidence scores,
or raw JSON** — those are implementation-facing.

### 4.4 Engineer access to a customer board

Default: the engineer works from the **spec**, not the live board (the spec is self-contained
by design — that's the §0 thesis). Opening the customer's editable canvas is **out of scope**;
if wanted later, it's a read-only board mount gated by `RequireRole`. Stated so the boundary is
explicit, not accidental.

---

## 5. The internal engineer experience

### 5.1 Engineer Home — the spec inbox (`/` for `role==='engineer'`)

A **flat, global list of every submitted spec across all customers** (the locked "global"
decision). This is a *different* screen from the customer Home, not a filter on it:

```
┌─ Submitted specs ───────────────────────────  [ All ▾ Submitted Building Deployed ] ┐
│                                                                                      │
│  Acme Corp   · Inbound Import Receiving · v3 · 2h ago   🔒 Submitted   [ Open → ]    │
│  Globex      · Returns Intake           · v1 · 1d ago   🛠 Building     [ Open → ]    │
│  Initech     · COA Validation           · v2 · 3d ago   ✅ Deployed     [ Open → ]    │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- One row per **latest submitted version per process** (older versions on the detail page).
- Columns: **customer/company** (`profiles.company`), process name, version, submitted-at,
  **handoff status**, open action.
- **Status filter** chips mirror `spec_build.status`.
- Empty state: "No specs have been submitted yet."

This is the screen that answers the ask directly: *an internal engineer can see all specs that
have been submitted by customers.*

### 5.2 Engineer spec detail (`/specs/:specId`)

```
┌─ Acme Corp · Inbound Import Receiving · v3 ──────────────────────────────┐
│  🔒 spec_a1b2c3d4   submitted 2h ago   completeness 92%                  │
│  Handoff status:  [ Submitted ▾ ]  →  advance to Building / Deployed     │
│  Versions:  v3 (this) · v2 · v1                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  [ Summary ]  [ Spec JSON ]  [ Resolved assumptions ]  [ Findings ]      │
│  ─────────                                                                │
│  …the same SpecModal JSON view, now read-only and embedded…              │
│  [ Copy JSON ]  [ Download .json ]                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Full `FrozenSpec` JSON** (the retired `SpecModal` body, reused read-only) + the summary +
  resolved assumptions + the deterministic findings. This is the engineer's working artifact —
  the exact object Task 2's coding agent consumes.
- **Version history** — every `frozen_spec` row for the process, switchable.
- **Handoff status control** (§5.4).

### 5.3 Reusing `SpecModal`

`SpecModal`'s JSON/copy/download body is already exactly what the engineer needs. The plan:
extract its inner content into a `SpecJsonView` and mount it inside `EngineerSpecDetail`
(read-only). The customer flow drops `SpecModal` entirely (§3.3 / §4.3). Net: one component
split, no logic rewrite.

### 5.4 Advancing the handoff status

The engineer moves a spec forward; the customer sees the change reflected on their locked spec:

```
submitted ──[ engineer: Start build ]──▶ in_build ──[ engineer: Mark deployed ]──▶ deployed
```

- A single `setSpecStatus(specId, status)` data call updates `spec_build` (stamping
  `updated_by`/`updated_at`). RLS allows this only for engineers (§6).
- Linear forward-only in the UI (no backward transitions in the time box); the enum permits any
  value, so a "request changes" back-channel is a later addition, not a schema change.
- The customer's Home card and summary read `spec_build.status` → "Sent to team" / "Building…" /
  "Deployed". This is the visible handoff loop the ask wants.

---

## 6. Spec visibility & RLS (the security model)

RLS is the real boundary; the role-based routing is only UX. Policies (new migration):

```sql
alter table profiles    enable row level security;
alter table spec_build  enable row level security;
-- process / card / edge / comment / frozen_spec already have owner-scoped RLS (migration …0003)

-- Everyone can read their own profile; engineers can read all (to label the inbox).
create policy profiles_self_read on profiles for select
  using ( id = auth.uid() or is_engineer() );

-- A helper that reads the caller's role once.
create or replace function is_engineer() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'engineer');
$$ language sql security definer stable;

-- frozen_spec: owners read their own (existing); engineers read ALL.
create policy frozen_spec_engineer_read on frozen_spec for select
  using ( is_engineer() or owns_process(process_id) );

-- spec_build: owners (customers) read their spec's status; engineers read + write all.
create policy spec_build_read   on spec_build for select using ( is_engineer() or owns_spec(spec_id) );
create policy spec_build_write  on spec_build for update using ( is_engineer() );
create policy spec_build_insert on spec_build for insert with check ( owns_spec(spec_id) or is_engineer() );
```

*(`owns_process` / `owns_spec` are thin helpers over the existing owner-scoping; exact SQL
finalised against migration `…0003`'s existing policies at implementation.)*

**The guarantees:**
- A customer sees **only their own** processes, boards, comments, and specs — unchanged.
- An engineer sees **every submitted spec** and can **advance its status**, but cannot edit a
  customer's canvas or mutate the frozen payload (the immutability rules still apply to all).
- The role check is server-side; a tampered client cannot escalate.

---

## 7. Persistence — migrations & data layer

### 7.1 New migration `00000000000006_roles_and_handoff.sql`

- `app_role` enum + `profiles` table + `handle_new_user()` trigger (§1.2).
- `build_status` enum + `spec_build` table (§3.2).
- `is_engineer()` / ownership helpers + the RLS policies (§6).
- Applies cleanly via `supabase db push`.

### 7.2 Data layer additions (`web/src/data/`)

```ts
// profiles.ts (new)
getMyProfile(): Promise<{ role: 'customer'|'engineer'; displayName: string|null; company: string|null }>;

// processes.ts — wire the submit path (functions already exist; add status + version)
submitSpec(processId: string, input: {            // NEW orchestrator used by Topbar
  spec: FrozenSpec;                                // built with the REAL version + overrideReason
}): Promise<void>;                                 // insertFrozenSpec + spec_build(submitted)
getSpecStatus(specId: string): Promise<BuildStatus>;
listSpecStatuses(specIds: string[]): Promise<Map<string, BuildStatus>>;   // Home grid, no N+1

// specs.ts (new — engineer surface)
listAllSubmittedSpecs(opts?: { status?: BuildStatus }): Promise<EngineerSpecRow[]>;  // latest per process
getSpec(specId: string): Promise<{ payload: FrozenSpec; status: BuildStatus; company: string }>;
listSpecVersions(processId: string): Promise<FrozenSpecMeta[]>;
setSpecStatus(specId: string, status: BuildStatus): Promise<void>;   // engineer only (RLS-guarded)
```

`EngineerSpecRow = { specId, processId, processName, company, version, submittedAt, status }`.
`listAllSubmittedSpecs` relies on RLS to return cross-customer rows for engineers and joins
`profiles.company` for the label.

---

## 8. Delta: built vs. to-build

| # | Item | Status | Work |
|---|------|--------|------|
| 1 | `FrozenSpec` object | ✅ built | — |
| 2 | `frozen_spec` table (immutable) | ✅ built | — |
| 3 | `insertFrozenSpec` / `nextSpecVersion` / `listFrozenSpecs` | ✅ built, unused | call them |
| 4 | Revision loop (comments) | ✅ built | — |
| 5 | Submit confirm dialog + gate (override+reason) | ✅ built | `board/SubmitDialog.tsx` + `Topbar` `doSubmit` |
| 6 | Real versioning on submit (drop hardcoded `v1`) | ✅ built | `nextSpecVersion` |
| 7 | Customer post-submit lock + friendly summary | ✅ built | `board/SpecSummary.tsx` (replaced customer `SpecModal`) |
| 8 | `profiles` + email-domain role trigger | ✅ built | migration `…0006` |
| 9 | `role` on `authStore` + role-aware routing + `RequireRole` | ✅ built | `authStore`, `RoleHome`, `RequireRole` |
| 10 | `spec_build` table + handoff status | ✅ built | migration `…0006` |
| 11 | Engineer Home (global spec inbox) | ✅ built | `routes/EngineerHome.tsx` + `data/specs.ts` |
| 12 | Engineer spec detail (JSON view + status control + versions) | ✅ built | `routes/EngineerSpecDetail.tsx` + `board/SpecJsonView.tsx` |
| 13 | RLS for cross-customer engineer reads + status writes | ✅ built | migration `…0006` |
| 14 | Customer Home status chip on submitted cards | ✅ built | `WhiteboardCard` + `latestBuildStatuses` |

---

## 9. Acceptance criteria

- [ ] Signing up with `@usemeridian.io` lands on the **engineer** Home; any other domain lands
      on the **customer** Home — role derived server-side, never asserted by the client.
- [ ] **Customer Submit** shows a confirmation; on confirm it **persists** an immutable
      `frozen_spec` row at `max(version)+1`, sets `process.status='submitted'`, creates a
      `spec_build` row at `submitted`, and shows a **🔒 lock + "sent to team"** confirmation.
- [ ] With open comments, Submit requires a **reason**, records it in `sourceMeta.overrideReason`,
      and never hard-blocks; with zero open comments it is one click.
- [ ] The **customer never sees raw JSON** post-submit — only the friendly summary + lock + status.
- [ ] Re-submitting produces a **new version**; old versions and their statuses persist.
- [ ] The **engineer** sees a **global list of all submitted specs** (customer, process, version,
      status) and can open any one to view the **full `FrozenSpec` JSON** + summary + versions.
- [ ] The engineer can **advance the handoff status** (`submitted → in_build → deployed`); the
      change is visible to the customer on their locked spec.
- [ ] A customer **cannot** read another customer's specs or any engineer-only route (RLS + guard).
- [ ] New migrations apply cleanly via `supabase db push`; the `frozen_spec` payload remains
      immutable (UPDATE/DELETE no-op).

---

## 10. Open questions / chosen defaults

- **Engineer ↔ board access** — default **spec-only** (the spec is self-contained by design).
  Read-only board mount is a later add, not in scope.
- **Status transitions** — forward-only in the UI for the time box; the enum allows any value, so
  a "request changes" reverse path is a UI addition later, not a schema change.
- **`company` source** — email domain as a stand-in; a real onboarding sets it explicitly.
- **Notifications** — when a spec is submitted / status advances, no email/push for the time box;
  both sides see it on next load. A Supabase realtime subscription is the natural later add.
- **Status granularity** — three states (`submitted/in_build/deployed`) is enough to show the
  loop; finer build telemetry (which evals pass, Task 2) belongs to the agent milestone.
