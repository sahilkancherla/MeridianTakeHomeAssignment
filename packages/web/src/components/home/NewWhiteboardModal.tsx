import { useState } from 'react';
import { createProcess, type ProcessTemplate } from '../../data/processes';
import { Modal } from '../common/Modal';

/** Create flow (home-spec §2.3): name, description, and a starting point. */
export function NewWhiteboardModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState<ProcessTemplate>('blank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await createProcess({ name, description, template });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the whiteboard.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New whiteboard"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="new-wb" className="btn btn--primary" disabled={busy || !name.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <form id="new-wb" onSubmit={submit} className="newwb">
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Inbound Import Receiving"
            autoFocus
          />
        </label>
        <label className="field">
          <span className="field__label">Description</span>
          <input
            className="control"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — what process does this map?"
          />
        </label>

        <div className="field">
          <span className="field__label">Start from</span>
          <div className="newwb__templates">
            <TemplateOption
              checked={template === 'blank'}
              onSelect={() => setTemplate('blank')}
              title="Blank canvas"
              desc="An empty board — drop your own primitives."
            />
            <TemplateOption
              checked={template === 'receiving_starter'}
              onSelect={() => setTemplate('receiving_starter')}
              title="Inbound Import Receiving (starter)"
              desc="The intentionally-incomplete receiving process, ready to refine."
            />
          </div>
        </div>

        {error && <div className="auth__msg auth__msg--error">{error}</div>}
      </form>
    </Modal>
  );
}

function TemplateOption({
  checked,
  onSelect,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button type="button" className={`newwb__tpl ${checked ? 'is-checked' : ''}`} onClick={onSelect}>
      <span className="newwb__radio" aria-hidden />
      <span className="newwb__tpltext">
        <span className="newwb__tpltitle">{title}</span>
        <span className="newwb__tpldesc">{desc}</span>
      </span>
    </button>
  );
}
