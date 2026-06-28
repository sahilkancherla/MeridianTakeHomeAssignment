import { useMemo, useState } from 'react';
import type { FrozenSpec } from '@meridian/spec';

/**
 * The raw FrozenSpec — stats + full JSON with copy/download. This is the ENGINEER's
 * working artifact (the exact object Task 2's coding agent consumes). Customers never
 * see it; they get the plain-language SpecSummary instead.
 * See docs/design/submit-and-handoff-spec.md §5.3.
 */
export function SpecJsonView({ spec }: { spec: FrozenSpec }) {
  const json = useMemo(() => JSON.stringify(spec, null, 2), [spec]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const download = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(spec.processName)}.spec.v${spec.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="specjson">
      <div className="modal__stats">
        <Stat k="version" v={`v${spec.version}`} />
        <Stat k="steps" v={spec.cards.length} />
        <Stat k="connections" v={spec.edges.length} />
        <Stat k="outcomes" v={spec.outcomes.length} />
      </div>

      <div className="specjson__actions">
        <code className="modal__id">{spec.specId}</code>
        <div className="specjson__btns">
          <button type="button" className="btn btn--ghost" onClick={download}>
            Download .json
          </button>
          <button type="button" className="btn btn--primary" onClick={copy}>
            {copied ? 'Copied ✓' : 'Copy JSON'}
          </button>
        </div>
      </div>

      <pre className="modal__json scroll-thin">{json}</pre>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="modal__stat">
      <span className="modal__statk">{k}</span>
      <span className="modal__statv">{v}</span>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'process';
}
