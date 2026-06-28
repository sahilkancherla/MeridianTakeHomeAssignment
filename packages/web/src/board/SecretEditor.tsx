import { useEffect, useState } from 'react';
import type { SecretRef } from '@meridian/spec';
import { listSecretKeys, removeSecret, setSecret } from '../data/secrets';

/**
 * Declares and stores the credentials a System needs.
 *
 * The card carries only the DECLARATION (key + label + description), which travels in the
 * spec. The secret VALUE is written straight to the owner-scoped secret store (never the
 * card, never the spec) and is never read back into the UI — we only sync which keys have a
 * saved value, to show "saved" and set `provided` on the declaration. See
 * docs/design/system-access-and-secrets.md.
 */
export function SecretEditor({
  processId,
  cardId,
  secrets,
  onChange,
  disabled,
}: {
  processId: string | null;
  cardId: string;
  secrets: SecretRef[];
  onChange: (secrets: SecretRef[]) => void;
  disabled?: boolean;
}) {
  // Local value inputs, keyed by secret key. Never seeded from the store (values are write-only).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync which keys already have a stored value, so `provided` reflects reality on open.
  useEffect(() => {
    if (!processId) return;
    let live = true;
    listSecretKeys(processId, cardId)
      .then((saved) => {
        if (!live) return;
        const savedSet = new Set(saved);
        const next = secrets.map((s) => ({ ...s, provided: savedSet.has(s.key) }));
        if (next.some((s, i) => s.provided !== secrets[i]?.provided)) onChange(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Re-sync when the card changes; intentionally not depending on `secrets`/`onChange`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId, cardId]);

  const setAt = (i: number, patch: Partial<SecretRef>) =>
    onChange(secrets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const add = () => {
    const key = `secret_${crypto.randomUUID().slice(0, 8)}`;
    onChange([...secrets, { key, label: '', description: '' }]);
  };

  const removeDeclaration = async (i: number) => {
    const s = secrets[i];
    if (s?.provided && processId) await removeSecret(processId, cardId, s.key).catch(() => {});
    onChange(secrets.filter((_, idx) => idx !== i));
  };

  const save = async (i: number) => {
    const s = secrets[i];
    if (!s) return;
    const value = (drafts[s.key] ?? '').trim();
    if (!processId || !value) return;
    setBusy(s.key);
    setError(null);
    try {
      await setSecret(processId, cardId, s.key, value);
      setDrafts((d) => ({ ...d, [s.key]: '' }));
      setAt(i, { provided: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save secret.');
    } finally {
      setBusy(null);
    }
  };

  const clear = async (i: number) => {
    const s = secrets[i];
    if (!s || !processId) return;
    setBusy(s.key);
    setError(null);
    try {
      await removeSecret(processId, cardId, s.key);
      setAt(i, { provided: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear secret.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="secrets">
      {secrets.map((s, i) => (
        <div className="secret" key={s.key}>
          <div className="secret__head">
            <input
              className="control control--sm"
              value={s.label}
              onChange={(e) => setAt(i, { label: e.target.value })}
              placeholder="Credential name, e.g. Gmail app password"
              disabled={disabled}
            />
            <button
              type="button"
              className="branches__del"
              onClick={() => removeDeclaration(i)}
              aria-label="Remove credential"
              disabled={disabled}
            >
              ×
            </button>
          </div>
          <input
            className="control control--sm"
            value={s.description ?? ''}
            onChange={(e) => setAt(i, { description: e.target.value })}
            placeholder="Where to get it (optional)"
            disabled={disabled}
          />
          <div className="secret__value">
            {s.provided ? (
              <>
                <span className="secret__saved" title={`Stored as "${s.key}"`}>
                  ●●●●●●  saved
                </span>
                <button type="button" className="btn btn--sm" onClick={() => clear(i)} disabled={disabled || busy === s.key}>
                  Clear
                </button>
              </>
            ) : (
              <>
                <input
                  className="control control--sm"
                  type="password"
                  value={drafts[s.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                  placeholder={processId ? 'Enter value to store securely' : 'Save the board first'}
                  disabled={disabled || !processId}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => save(i)}
                  disabled={disabled || !processId || !(drafts[s.key] ?? '').trim() || busy === s.key}
                >
                  Save
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      {error && <p className="secrets__error">{error}</p>}
      <button type="button" className="branches__add" onClick={add} disabled={disabled}>
        + Add credential
      </button>
    </div>
  );
}
