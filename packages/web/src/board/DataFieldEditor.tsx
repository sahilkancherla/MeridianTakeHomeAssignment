import type { DataField } from '@meridian/spec';

/**
 * Edits the named data fields a step carries — an Input's `fields` (the data on the
 * document) or an Action's `produces` (the data the step establishes). Stays plain
 * language: a name and a sentence, optionally a sample value and a required toggle. Each
 * field becomes an authoritative produced fact (see @meridian/spec process-graph), so this
 * is what turns "read the invoice" into a checkable extraction schema without asking the
 * owner to write types.
 */
export function DataFieldEditor({
  fields,
  onChange,
  noun,
}: {
  fields: DataField[];
  onChange: (fields: DataField[]) => void;
  /** What one field is called here, e.g. "field" (Input) or "output" (Action). */
  noun: string;
}) {
  const setAt = (i: number, patch: Partial<DataField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const removeAt = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () => onChange([...fields, { name: '', description: '', required: false, example: '' }]);

  return (
    <div className="datafields">
      {fields.map((f, i) => (
        <div className="datafield" key={i}>
          <div className="datafield__head">
            <input
              className="control control--sm"
              value={f.name}
              onChange={(e) => setAt(i, { name: e.target.value })}
              placeholder={`${noun} name, e.g. PO number`}
            />
            <button
              type="button"
              className="branches__del"
              onClick={() => removeAt(i)}
              aria-label={`Remove ${noun}`}
            >
              ×
            </button>
          </div>
          <input
            className="control control--sm"
            value={f.description ?? ''}
            onChange={(e) => setAt(i, { description: e.target.value })}
            placeholder="What it is / where to find it (optional)"
          />
          <div className="datafield__row">
            <input
              className="control control--sm"
              value={f.example ?? ''}
              onChange={(e) => setAt(i, { example: e.target.value })}
              placeholder="example value (optional)"
            />
            <label className="datafield__req">
              <input
                type="checkbox"
                checked={!!f.required}
                onChange={(e) => setAt(i, { required: e.target.checked })}
              />
              required
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="branches__add" onClick={add}>
        + Add {noun}
      </button>
    </div>
  );
}
