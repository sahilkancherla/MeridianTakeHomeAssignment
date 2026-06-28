import type { Card } from '@meridian/spec';
import { useBoard } from '../store/boardStore';
import { useComments } from '../store/commentStore';
import { PRIMITIVE_META } from '../primitives/catalog';
import { PRIMITIVE_ICONS } from '../primitives/icons';
import { Field, NumberField, TextArea, TextField, Toggle } from './fields';
import { ConditionBranchEditor } from './ConditionBranchEditor';
import { DataFieldEditor } from './DataFieldEditor';
import { SecretEditor } from './SecretEditor';
import { ContextSection } from './ContextSection';

export function Inspector() {
  const selectedId = useBoard((s) => s.selectedCardId);
  const card = useBoard((s) => s.cards.find((c) => c.id === s.selectedCardId) ?? null);
  const cards = useBoard((s) => s.cards);
  const update = useBoard((s) => s.updateCard);
  const remove = useBoard((s) => s.removeCard);
  const aiPreview = useBoard((s) => s.locked);
  const readOnly = useBoard((s) => s.readOnly);
  const processId = useBoard((s) => s.processId);
  const locked = aiPreview || readOnly;

  if (!card || !selectedId) {
    return (
      <aside className="inspector inspector--empty">
        <div className="inspector__empty">
          <span className="inspector__empty-mark">◆</span>
          <p>Select a card to edit its details.</p>
          <p className="inspector__empty-sub">Everything you fill in here becomes part of the frozen spec.</p>
        </div>
      </aside>
    );
  }

  const meta = PRIMITIVE_META[card.type];
  const Icon = PRIMITIVE_ICONS[card.type];
  // Narrowed patch helper — each branch below passes fields valid for that type.
  const set = (patch: Partial<Card>) => update(card.id, patch);

  return (
    <aside className={`inspector ${meta.tintClass} scroll-thin`}>
      <header className="inspector__head">
        <span className="inspector__chip">
          <Icon />
        </span>
        <div>
          <div className="inspector__type">{meta.name}</div>
          <div className="inspector__def">{meta.tooltip}</div>
        </div>
      </header>

      {locked && (
        <div className="inspector__locknote">
          {readOnly
            ? 'This whiteboard is locked — submitted to your Meridian team. They can unlock it if you need to make changes.'
            : 'Canvas is read-only while a proposed AI change is pending.'}
        </div>
      )}

      <div className={`inspector__body ${locked ? 'is-locked' : ''}`}>
        <Field label="Label">
          <TextField value={card.label} onChange={(v) => set({ label: v })} placeholder={`${meta.name} title`} />
        </Field>

        <Field label="Description" hint="Plain-language detail. Optional, but it sharpens the spec.">
          <TextArea
            value={card.description ?? ''}
            onChange={(v) => set({ description: v })}
            placeholder="What does this step mean in practice?"
          />
        </Field>

        <TypeFields card={card} cards={cards} set={set} processId={processId} locked={locked} />

        <ContextSection card={card} onChange={(context) => set({ context })} />

        <AnnotationBlock cardId={card.id} />
      </div>

      <footer className="inspector__foot">
        <button type="button" className="btn btn--danger" onClick={() => remove(card.id)} disabled={locked}>
          Delete card
        </button>
      </footer>
    </aside>
  );
}

function TypeFields({
  card,
  cards,
  set,
  processId,
  locked,
}: {
  card: Card;
  cards: Card[];
  set: (patch: Partial<Card>) => void;
  processId: string | null;
  locked: boolean;
}) {
  switch (card.type) {
    case 'trigger':
      return (
        <Field label="Source" hint="Where the triggering event comes from.">
          <TextField value={card.source ?? ''} onChange={(v) => set({ source: v })} placeholder="e.g. Gmail inbox" />
        </Field>
      );

    case 'input':
      return (
        <>
          <Field label="Required">
            <Toggle
              checked={card.required}
              onChange={(v) => set({ required: v })}
              labels={['Required to continue', 'Optional']}
            />
          </Field>
          <Field label="Format" hint="The shape of the input, if it matters.">
            <TextField value={card.format ?? ''} onChange={(v) => set({ format: v })} placeholder="e.g. PDF, CSV" />
          </Field>
          <Field label="Fields" hint="The data this document carries — what the agent should pull out of it.">
            <DataFieldEditor fields={card.fields ?? []} onChange={(fields) => set({ fields })} noun="field" />
          </Field>
        </>
      );

    case 'system':
      return (
        <>
          <Field label="How it's accessed" hint="In plain language — your team picks the right tool from this.">
            <TextArea
              value={card.access ?? ''}
              onChange={(v) => set({ access: v })}
              placeholder="e.g. We log into the shared Gmail inbox in a browser"
            />
          </Field>
          <Field
            label="Credentials"
            hint="What the agent needs to sign in. Values are stored securely and never leave the server or enter the spec."
          >
            <SecretEditor
              processId={processId}
              cardId={card.id}
              secrets={card.secrets ?? []}
              onChange={(secrets) => set({ secrets })}
              disabled={locked}
            />
          </Field>
        </>
      );

    case 'action':
      return (
        <>
          <Field label="System" hint="Which system this action touches.">
            <SystemSelect
              cards={cards}
              value={card.systemId}
              onChange={(v) => set({ systemId: v })}
            />
          </Field>
          <Field label="Produces" hint="The data this step establishes — read downstream by Rules and Branches.">
            <DataFieldEditor fields={card.produces ?? []} onChange={(produces) => set({ produces })} noun="output" />
          </Field>
          <Field label="Wait up to (days)" hint="Optional. How long to wait before this is overdue.">
            <NumberField value={card.waitDays} onChange={(v) => set({ waitDays: v })} placeholder="—" min={0} />
          </Field>
        </>
      );

    case 'rule':
      return (
        <Field label="Condition" hint="The check, in plain language. Must be true to continue.">
          <TextArea
            value={card.expression}
            onChange={(v) => set({ expression: v })}
            placeholder="e.g. Invoice and COA are both present"
          />
        </Field>
      );

    case 'branch':
      return (
        <Field
          label="Conditional paths"
          hint="Each path has a short label (its connector) and a condition for when it's taken. A plain Yes/No split is two paths; add more for a multi-way branch."
        >
          <ConditionBranchEditor branches={card.branches} onChange={(branches) => set({ branches })} />
        </Field>
      );

    case 'exception':
      return (
        <Field label="When it triggers" hint="The condition that makes this the path taken.">
          <TextArea
            value={card.condition}
            onChange={(v) => set({ condition: v })}
            placeholder="e.g. COA is missing from the email"
          />
        </Field>
      );

    case 'outcome':
      return (
        <Field label="Disposition" hint="The terminal state this represents.">
          <TextField
            value={card.disposition ?? ''}
            onChange={(v) => set({ disposition: v })}
            placeholder="e.g. approved, held"
          />
        </Field>
      );
  }
}

/** The AI review's understanding of this card (whiteboard-spec §6.5): confidence
 *  plus what it had to assume / found ambiguous. Surfaced so the model's reasoning —
 *  and the completeness score it feeds — is legible to the process owner. */
function AnnotationBlock({ cardId }: { cardId: string }) {
  const annotation = useComments((s) => s.annotations.find((a) => a.cardId === cardId));
  if (!annotation) return null;

  const { confidence, assumptions, ambiguities } = annotation;
  return (
    <div className="annot">
      <div className="annot__head">
        <span className="annot__eyebrow">AI understanding</span>
        <span className={`annot__conf annot__conf--${confidence}`}>{confidence} confidence</span>
      </div>
      {ambiguities.length > 0 && (
        <div className="annot__group">
          <span className="annot__k">Ambiguities</span>
          <ul className="annot__list">
            {ambiguities.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {assumptions.length > 0 && (
        <div className="annot__group">
          <span className="annot__k">Assumptions</span>
          <ul className="annot__list">
            {assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {ambiguities.length === 0 && assumptions.length === 0 && (
        <p className="annot__clean">No open assumptions — the AI reads this step clearly.</p>
      )}
    </div>
  );
}

/** Pick a System card to link an Action to. */
function SystemSelect({
  cards,
  value,
  onChange,
}: {
  cards: Card[];
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  const systems = cards.filter((c) => c.type === 'system');
  return (
    <select
      className="control control--select"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">— none —</option>
      {systems.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label || 'Untitled system'}
        </option>
      ))}
    </select>
  );
}
