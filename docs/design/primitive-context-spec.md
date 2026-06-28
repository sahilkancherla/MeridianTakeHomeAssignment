# Primitive Context — Build Spec

> Status: **Implemented (v1)**
> Owner: Sahil Kancherla
> Parent: [`design-doc.md`](./design-doc.md) · Consumed by Task 2 (spec → agent → self-heal)

Lets a process owner attach **rich, non-text context** to any primitive so the
generated (and self-healing) agent understands how to actually perform the step — and
so the eval loop has concrete inputs and expectations. The context flows into the frozen
spec the coding agent builds from.

## Decisions (from design review)
- **Universal ContextBlock** on every primitive (not per-type structured fields yet).
- **Conditions stay text + example cases** — no structured predicate field (respects the
  Section-0 "don't rebuild a programming language" stance). Examples disambiguate instead.
- **Attachments in Supabase Storage** (private bucket), keyed by owner so RLS is simple.

## Model (`@meridian/spec`, `primitives.ts`)
`CardBase` gains an optional `context?: ContextBlock`. All fields optional — existing
cards keep working; the serializer already folds it into `card.fields_jsonb` (no
serializer change), and `buildFrozenSpec` embeds cards verbatim, so context reaches the
coding agent and changes the spec's content hash (different context ⇒ different spec).

```ts
type ContextBlock = {
  notes?: string[];              // edge cases & gotchas
  references?: ReferenceLink[];  // SOP / policy / ticket URLs (label + url)
  examples?: ExampleCase[];      // input → expected — also the eval seeds
  attachments?: Attachment[];    // sample docs / screenshots / reference files
  owner?: string;                // who owns / escalates this step
  criticality?: 'blocking' | 'advisory';
  humanInLoop?: boolean;         // must a person confirm before the agent proceeds?
};
type Attachment = { id; name; mime; size; path; kind: 'sample'|'screenshot'|'reference'|'other' };
type ReferenceLink = { label; url };
type ExampleCase = { input; expected };
```

## Why these forms (for the self-healing agent)
- **Examples = eval seeds.** An Input's examples are eval *inputs*; an Outcome's are eval
  *expectations*. The ~10 sample emails map onto Input examples.
- **Attachments = ground truth.** Sample invoice/COA PDFs are schema-by-example for
  extraction; screenshots show what a manual step looks like (a multimodal codegen reads
  both).
- **Notes / references / owner / criticality / human-in-loop** give the agent provenance
  and control signals (when to pause, who to escalate to, what's blocking vs advisory).

## Storage (migration `00000000000007_card_attachments.sql`)
- Private bucket `card-attachments`; object path `{userId}/{processId}/{cardId}/{id}-{name}`.
- RLS on `storage.objects` scopes every file to its owner via the first path folder
  (`= auth.uid()`), so no join to `process` is needed. CRUD policies for `authenticated`.
- Client helpers: `data/attachments.ts` — `uploadAttachment`, `attachmentUrl` (short-lived
  signed URL), `removeAttachment`. Only file *metadata* lives on the card; bytes stay in
  Storage.

## UI (`board/ContextSection.tsx`)
A collapsed "Context for the agent" section in the inspector (badge = item count), with
small list editors for examples (input → expected), attachments (upload/open/remove),
references, and notes, plus owner / criticality / human-in-loop. Optional and progressive
— the surface stays Miro-light.

## Capture stays owner-friendly
Per the Section-0 stance, the *capture* surface is intentionally light and optional; the
richness lands in the frozen spec for the code-first execution side. Next step (not in
v1): have the **AI review** flag thin steps ("this extraction has no example or sample
doc") and the **AI editor** propose context, so the owner mostly confirms rather than
authors.

## Run notes
- `supabase db push` to apply migration `00000000000007` before attachments work.
- Structured context (examples / references / notes / metadata) round-trips immediately
  through `card.fields_jsonb` — no migration needed for those.

## Update — per-type structured fields (now partly built)
The "next tiers" below have started landing as first-class primitive fields (not in the
universal ContextBlock):
- **Input `fields` / Action `produces`** — a plain-language extraction schema (`DataField[]`).
  When present they become the *authoritative* producers in the facts model (replacing the
  text heuristic) and give codegen a real schema. See [`whiteboard-spec.md`](./whiteboard-spec.md) §1.1/§7.2.1.
- **System access + credentials** — `access` (plain language) + `secrets` (declared, values
  stored off-card). The card no longer names a tool. See [`system-access-and-secrets.md`](./system-access-and-secrets.md).

## Not in v1 (deferred)
- Outcome output contracts (structured per-Outcome result shapes).
- AI authoring/suggestion of context; deeper codegen + eval wiring that consumes it.
