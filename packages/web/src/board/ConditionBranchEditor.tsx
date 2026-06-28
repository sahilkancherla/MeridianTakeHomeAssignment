import type { ConditionalPath } from '@meridian/spec';

/**
 * Edits a Branch's conditional paths. Each path is a short label (which becomes a
 * labeled outgoing connector on the card) plus the condition under which it's taken.
 * A plain Yes/No split is two paths; the number of paths is unbounded.
 */
export function ConditionBranchEditor({
  branches,
  onChange,
}: {
  branches: ConditionalPath[];
  onChange: (branches: ConditionalPath[]) => void;
}) {
  const setAt = (i: number, patch: Partial<ConditionalPath>) =>
    onChange(branches.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  const removeAt = (i: number) => onChange(branches.filter((_, idx) => idx !== i));
  const add = () => onChange([...branches, { label: `Path ${branches.length + 1}`, condition: '' }]);

  return (
    <div className="cond-branches">
      {branches.map((b, i) => (
        <div className="cond-branch" key={i}>
          <div className="cond-branch__head">
            <span className="branches__dot" />
            <input
              className="control control--sm"
              value={b.label}
              onChange={(e) => setAt(i, { label: e.target.value })}
              placeholder={`Path ${i + 1}`}
            />
            <button
              type="button"
              className="branches__remove"
              onClick={() => removeAt(i)}
              disabled={branches.length <= 1}
              title={branches.length <= 1 ? 'A branch needs at least one path' : 'Remove path'}
            >
              ×
            </button>
          </div>
          <textarea
            className="control control--area control--sm cond-branch__cond"
            value={b.condition}
            onChange={(e) => setAt(i, { condition: e.target.value })}
            placeholder="When is this path taken? e.g. order total is over $10,000"
          />
        </div>
      ))}
      <button type="button" className="branches__add" onClick={add}>
        + Add path
      </button>
    </div>
  );
}
