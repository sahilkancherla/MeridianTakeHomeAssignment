# Organizations — multi-user whiteboards

> Status: **Design — awaiting go-ahead**
> Owner: Sahil Kancherla
> Last updated: 2026-06-27
> Builds on: [`submit-and-handoff-spec.md`](./submit-and-handoff-spec.md) (roles, spec handoff)

Moves ownership of whiteboards from a **single user** to an **organization**. Every member
of an org can view and edit all of that org's whiteboards; Meridian engineers can edit and
comment on every org's whiteboards. This replaces the per-user RLS model from
`submit-and-handoff-spec.md` with an org-scoped one.

---

## 1. Decisions (from review)

| # | Decision |
|---|----------|
| D1 | **One org per user.** No org switcher; a user's Home is simply their org's whiteboards. |
| D2 | **Self-serve creation.** A user with no org sees a "Create an organization / wait to be added" gate; creating one makes them its first member. |
| D3 | **Add by email.** Any member adds a teammate by typing their email. If that email is a registered account with no org, they're added; otherwise it errors. (No dropdown — privacy + simplicity.) |
| D4 | **Engineers are cross-org.** Meridian engineers (role `engineer`) can open, edit, and comment on **every** org's whiteboards, plus keep the global spec inbox. They are **not** org members (`org_id` stays null). |
| D5 | **Role unchanged.** `app_role` (customer / engineer, by email domain) stays. "Customer" users belong to orgs; engineers don't. Org membership is orthogonal to role. |

---

## 2. Data model

Membership is **one org per user**, so it lives as a column on `profiles` — no join table.

```sql
organization(
  id uuid pk, name text not null,
  created_by uuid references auth.users(id), created_at timestamptz )

profiles.org_id  uuid references organization(id)   -- NULL = not in an org yet
process.org_id   uuid references organization(id)   -- the owning org (replaces user-scoping)
```

- `process.user_id` is **kept as `created_by`** (audit: who first made the board), but RLS and
  all listing now key off `process.org_id`, not `user_id`.
- `spec_build.customer_id` stays (who submitted); the engineer inbox now labels rows by the
  **org name** (joined via `process.org_id`) with the submitter email as secondary.

### 2.1 Helper functions (SECURITY DEFINER, pinned search_path)

```sql
my_org()       -> uuid     -- the caller's profiles.org_id (null if none)
is_engineer()  -> boolean  -- already exists (migration …0006/…0008)
```

`my_org()` is the spine of every new RLS policy, the same way `auth.uid()` was before.

---

## 3. RLS overhaul

The existing `own_*` policies (`…0005`) are **dropped** and replaced with org-scoped ones.
The shape for every process-owned table is identical: *your org, or you're an engineer.*

```sql
-- process: members of its org, or any engineer
create policy org_process on process for all to authenticated
  using  (org_id = my_org() or is_engineer())
  with check (org_id = my_org() or is_engineer());

-- child tables (card, edge, comment, ai_annotation, chat_message, frozen_spec, spec_build):
-- ownership inherited from the parent process's org
create policy org_card on card for all to authenticated
  using  (exists (select 1 from process p where p.id = card.process_id
                  and (p.org_id = my_org() or is_engineer())))
  with check (...same...);
-- …repeat per child table…

-- organization: members see their own; engineers see all (to label the inbox)
create policy org_read on organization for select to authenticated
  using (id = my_org() or is_engineer());
create policy org_create on organization for insert to authenticated
  with check (created_by = auth.uid());

-- profiles: see yourself, your org-mates, or (engineer) everyone
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or org_id = my_org() or is_engineer());
```

- `frozen_spec` keeps its immutability rules; its read policy becomes org-scoped + engineer,
  replacing the customer_id/owner check.
- `spec_build` write stays **engineer-only** (status + unlock); read becomes org-scoped + engineer.
- **Membership mutations never happen through a raw `profiles` UPDATE** — they go through the
  `add_member`/`leave_org` RPCs (§5), so there's no broad "update other people's rows" policy.

> **Why an RLS rewrite, not additive policies:** the old policies grant access on
> `user_id = auth.uid()`. Leaving them in would let a board's *original creator* keep
> private access after it moved to an org. They must be dropped so org membership is the
> single source of truth.

---

## 4. Migrating existing data

Every existing board is owned by one user. We give each existing customer their own org and
move their boards into it (one-org-per-user, so this is lossless):

```sql
-- 1. one org per existing customer, named after their company/email
insert into organization (name, created_by)
  select coalesce(nullif(p.company,''), p.email, 'My organization'), p.id
  from profiles p where p.role = 'customer';

-- 2. put each customer in their new org
update profiles p set org_id = o.id
  from organization o where o.created_by = p.id and p.role = 'customer';

-- 3. point existing boards at their creator's org
update process pr set org_id = o.id
  from organization o where o.created_by = pr.user_id;
```

Engineers get no org (cross-org by role). After this, no board has a null `org_id`.

---

## 5. Add / manage members (RPCs)

Controlled cross-user mutations run through SECURITY DEFINER functions with internal checks,
not RLS update policies:

```sql
add_member(target_email text) returns json
  -- caller must be in an org; finds the user by email; rejects if:
  --   • no such account            → { ok:false, reason:'not_found' }
  --   • already in an org          → { ok:false, reason:'already_member' }
  --   • the account is an engineer → { ok:false, reason:'is_engineer' }
  -- otherwise sets their profiles.org_id = caller's org → { ok:true, email }

leave_org() returns void          -- caller sets their own org_id = null
remove_member(target_user uuid)   -- caller & target must share an org; clears target.org_id
```

Any member can add or remove (flat model, D3). The UI surfaces the rejection reasons as
friendly messages ("No Meridian-whiteboard account uses that email — ask them to sign up
first").

---

## 6. UI

### 6.1 No-org gate (customers only)
After login, if `role === 'customer'` and `org_id == null` → a full-screen gate:

```
┌─────────────────────────────────────────────┐
│  You're not part of an organization yet.     │
│                                              │
│  [ Create an organization ]                  │
│  name: [ Acme Corp________ ]                 │
│                                              │
│  …or ask a teammate to add you by your email │
│  (sahil@acme.com) and refresh.               │
└─────────────────────────────────────────────┘
```

Creating one calls `create_org(name)` (or an insert + self-join), sets the creator's
`org_id`, and drops them on Home. Engineers skip this gate entirely.

### 6.2 Home
Unchanged in shape — `listProcesses()` already returns whatever RLS allows, which is now
the org's boards. "+ New whiteboard" stamps `org_id = my_org()` on the new `process`. Copy
shifts from "Your whiteboards" → "**{Org name}** · whiteboards".

### 6.3 Organization settings (`/settings` → new "Organization" section)
- Org name (rename, any member).
- **Members list** — email + role, with a **"Add member"** email input and per-row Remove.
- "Leave organization" (with a guard if you're the last member).

### 6.4 Engineer cross-org board access
- The engineer spec detail gains **"Open whiteboard →"** (`/board/:processId`). RLS lets an
  engineer load any board.
- The board's **submission read-only lock applies to customers only** — an engineer can edit
  and comment on a board even while it's locked (they're the ones building it). So the
  `readOnly` gate becomes `readOnly && role === 'customer'`.
- Engineers leaving comments use the existing comment model with `author:'user'`; a small
  badge distinguishes Meridian comments from org-member comments (by looking up the author's
  role). *(New top-level comment authoring UI is its own line item — see §8.)*

---

## 7. Interaction with the existing handoff

- **Submit** still freezes a `frozen_spec` for the board; the spec now belongs to an org, so
  any org member can submit and any member sees the locked summary.
- **Engineer inbox** rows are now labeled by **org name** (the customer), submitter email
  secondary — "gmail.com" stops being the identity entirely.
- **Unlock** is unchanged (engineer-only), and now unlocks the board for the whole org.

---

## 8. Scope / cut line

In scope: org tables + membership, RLS rewrite, data backfill, add/remove-member RPCs, the
no-org gate, create-org, the members settings section, org-named Home + inbox, engineer
cross-org board open + edit (customer-only lock).

Deferred unless you want it now:
- **Authoring brand-new comments** (vs. replying to AI comments). The ask says engineers
  "leave comments"; today the comment UI is reply/reject on AI threads. A click-to-pin
  "add comment" affordance is a real sub-feature — flag it as a follow-up or fold it in.
- Multi-org membership + switcher (explicitly out, D1).
- Org admin role / invite tokens / email invitations (we add existing accounts only, D3).

---

## 9. Rollout

One migration, `00000000000010_organizations.sql`, applied via the **SQL Editor** (the CLI DB
password still won't authenticate). It: creates `organization`, adds `org_id` columns, adds
`my_org()` + the RPCs, runs the §4 backfill, and **drops + recreates** every RLS policy. After
it runs, every existing user is in their own org with their boards intact, and the add-member
flow lets them pull teammates in.

---

## 10. Acceptance criteria

- [ ] A new customer with no org sees the gate and can create an org, landing on Home.
- [ ] Two users in the same org both see and can edit the same whiteboards.
- [ ] Adding a teammate by email moves them into the org; bad/already-membered/engineer emails
      are rejected with clear messages.
- [ ] A user removed from an org (or who leaves) loses access on next load.
- [ ] An engineer can open, edit, and comment on any org's board, even when it's customer-locked.
- [ ] Existing boards still load for their original owner, now via their auto-created org.
- [ ] RLS blocks a user from reading another org's boards/specs (verified by the REST probe).
