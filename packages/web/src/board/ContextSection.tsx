import { useState } from 'react';
import type {
  Attachment,
  Card,
  ContextBlock,
  Criticality,
  ExampleCase,
  ReferenceLink,
} from '@meridian/spec';
import { useBoard } from '../store/boardStore';
import { attachmentUrl, removeAttachment, uploadAttachment } from '../data/attachments';
import { Field, TextField, Toggle } from './fields';

/**
 * Rich, non-text context for a primitive (primitive-context-spec): examples,
 * attachments, references, notes, and control metadata. All optional, collapsed by
 * default, and folded into the frozen spec the coding agent + eval loop consume.
 */
export function ContextSection({
  card,
  onChange,
}: {
  card: Card;
  onChange: (ctx: ContextBlock) => void;
}) {
  const ctx = card.context ?? {};
  const patch = (p: Partial<ContextBlock>) => onChange({ ...ctx, ...p });
  const count =
    (ctx.examples?.length ?? 0) +
    (ctx.attachments?.length ?? 0) +
    (ctx.references?.length ?? 0) +
    (ctx.notes?.length ?? 0) +
    (ctx.owner ? 1 : 0) +
    (ctx.criticality ? 1 : 0) +
    (ctx.humanInLoop ? 1 : 0);

  return (
    <details className="context" open={count > 0}>
      <summary className="context__summary">
        Context for the agent
        {count > 0 && <span className="context__count">{count}</span>}
      </summary>
      <div className="context__body">
        <p className="context__hint">
          Everything here flows into the frozen spec the coding agent builds from. Optional —
          but it's what makes the generated agent reliable.
        </p>

        <ExampleEditor examples={ctx.examples ?? []} onChange={(examples) => patch({ examples })} />
        <AttachmentEditor
          cardId={card.id}
          attachments={ctx.attachments ?? []}
          onChange={(attachments) => patch({ attachments })}
        />
        <LinkEditor links={ctx.references ?? []} onChange={(references) => patch({ references })} />
        <NoteEditor notes={ctx.notes ?? []} onChange={(notes) => patch({ notes })} />

        <Field label="Owner" hint="Who owns or escalates this step.">
          <TextField
            value={ctx.owner ?? ''}
            onChange={(v) => patch({ owner: v || undefined })}
            placeholder="e.g. Receiving lead"
          />
        </Field>
        <Field label="Criticality" hint="Does this step block the process, or is it advisory?">
          <select
            className="control control--select"
            value={ctx.criticality ?? ''}
            onChange={(e) => patch({ criticality: (e.target.value || undefined) as Criticality | undefined })}
          >
            <option value="">— unset —</option>
            <option value="blocking">Blocking</option>
            <option value="advisory">Advisory</option>
          </select>
        </Field>
        <Field label="Human in the loop">
          <Toggle
            checked={ctx.humanInLoop ?? false}
            onChange={(v) => patch({ humanInLoop: v || undefined })}
            labels={['A person must confirm', 'Fully automatable']}
          />
        </Field>
      </div>
    </details>
  );
}

function ExampleEditor({
  examples,
  onChange,
}: {
  examples: ExampleCase[];
  onChange: (e: ExampleCase[]) => void;
}) {
  const setAt = (i: number, p: Partial<ExampleCase>) =>
    onChange(examples.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  return (
    <Field label="Examples (input → expected)" hint="Concrete cases — these also seed the agent's eval suite.">
      <div className="ctx-list">
        {examples.map((e, i) => (
          <div className="ctx-example" key={i}>
            <input
              className="control control--sm"
              value={e.input}
              onChange={(ev) => setAt(i, { input: ev.target.value })}
              placeholder="Input / situation"
            />
            <span className="ctx-example__arrow">→</span>
            <input
              className="control control--sm"
              value={e.expected}
              onChange={(ev) => setAt(i, { expected: ev.target.value })}
              placeholder="Expected result"
            />
            <button
              type="button"
              className="branches__remove"
              onClick={() => onChange(examples.filter((_, idx) => idx !== i))}
              title="Remove example"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="branches__add"
          onClick={() => onChange([...examples, { input: '', expected: '' }])}
        >
          + Add example
        </button>
      </div>
    </Field>
  );
}

function LinkEditor({
  links,
  onChange,
}: {
  links: ReferenceLink[];
  onChange: (l: ReferenceLink[]) => void;
}) {
  const setAt = (i: number, p: Partial<ReferenceLink>) =>
    onChange(links.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  return (
    <Field label="References" hint="Links to the SOP, policy, or ticket this step comes from.">
      <div className="ctx-list">
        {links.map((l, i) => (
          <div className="ctx-link" key={i}>
            <input
              className="control control--sm"
              value={l.label}
              onChange={(ev) => setAt(i, { label: ev.target.value })}
              placeholder="Label"
            />
            <input
              className="control control--sm control--mono"
              value={l.url}
              onChange={(ev) => setAt(i, { url: ev.target.value })}
              placeholder="https://…"
            />
            <button
              type="button"
              className="branches__remove"
              onClick={() => onChange(links.filter((_, idx) => idx !== i))}
              title="Remove reference"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="branches__add"
          onClick={() => onChange([...links, { label: '', url: '' }])}
        >
          + Add reference
        </button>
      </div>
    </Field>
  );
}

function NoteEditor({ notes, onChange }: { notes: string[]; onChange: (n: string[]) => void }) {
  return (
    <Field label="Notes & edge cases" hint="Gotchas the agent should know (e.g. 'COA sometimes arrives in the email body').">
      <div className="ctx-list">
        {notes.map((n, i) => (
          <div className="ctx-note" key={i}>
            <input
              className="control control--sm"
              value={n}
              onChange={(ev) => onChange(notes.map((x, idx) => (idx === i ? ev.target.value : x)))}
              placeholder="An edge case or gotcha"
            />
            <button
              type="button"
              className="branches__remove"
              onClick={() => onChange(notes.filter((_, idx) => idx !== i))}
              title="Remove note"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="branches__add" onClick={() => onChange([...notes, ''])}>
          + Add note
        </button>
      </div>
    </Field>
  );
}

function AttachmentEditor({
  cardId,
  attachments,
  onChange,
}: {
  cardId: string;
  attachments: Attachment[];
  onChange: (a: Attachment[]) => void;
}) {
  const processId = useBoard((s) => s.processId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    if (!processId) {
      setErr('Save the board before attaching files.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const uploaded: Attachment[] = [];
      for (const f of files) uploaded.push(await uploadAttachment(processId, cardId, f));
      onChange([...attachments, ...uploaded]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const open = async (a: Attachment) => {
    try {
      window.open(await attachmentUrl(a.path), '_blank', 'noopener');
    } catch {
      setErr('Could not open this file.');
    }
  };

  const remove = async (a: Attachment) => {
    onChange(attachments.filter((x) => x.id !== a.id)); // optimistic
    try {
      await removeAttachment(a.path);
    } catch {
      /* metadata already removed; orphaned object is harmless */
    }
  };

  return (
    <Field label="Attachments" hint="Sample documents, screenshots, reference files — the agent and its evals can read these.">
      <div className="ctx-files">
        {attachments.map((a) => (
          <div className="ctx-file" key={a.id}>
            <button type="button" className="ctx-file__name" onClick={() => open(a)} title="Open">
              {a.name}
            </button>
            <span className="ctx-file__meta">{Math.max(1, Math.round(a.size / 1024))} KB</span>
            <button
              type="button"
              className="branches__remove"
              onClick={() => remove(a)}
              title="Remove attachment"
            >
              ×
            </button>
          </div>
        ))}
        <label className={`ctx-upload ${busy ? 'is-busy' : ''}`}>
          {busy ? 'Uploading…' : '+ Attach files'}
          <input type="file" multiple hidden onChange={onPick} disabled={busy} />
        </label>
        {err && <div className="ctx-files__err">{err}</div>}
      </div>
    </Field>
  );
}
