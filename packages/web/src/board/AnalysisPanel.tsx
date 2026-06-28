import { useMemo } from 'react';
import type { Fact } from '@meridian/spec';
import { useBoard } from '../store/boardStore';
import { useAnalysis } from '../store/useAnalysis';

/**
 * The live semantic schema (whiteboard-spec §6), recomputed from the canvas on
 * every edit: the completeness signal, deterministic findings, the data-flow
 * (facts) model, and normalized branches. This is the "what does the spec
 * look like right now" view — and the §7.1 soft-warning surface.
 */
export function AnalysisPanel() {
  const graph = useAnalysis();
  const cards = useBoard((s) => s.cards);
  const selectCard = useBoard((s) => s.selectCard);

  const labelOf = useMemo(() => {
    const m = new Map(cards.map((c) => [c.id, c.label || 'Untitled']));
    return (id: string | null) => (id ? (m.get(id) ?? '—') : '—');
  }, [cards]);

  return (
    <div className="analysis scroll-thin">
      <div className="analysis__intro">Recomputed live from the canvas — never stored, so it can't drift.</div>

      {/* Findings */}
      <section className="analysis__section">
        <h3 className="analysis__h">
          Findings <span className="analysis__count">{graph.findings.length}</span>
        </h3>
        {graph.findings.length === 0 ? (
          <p className="analysis__empty">No structural issues. Clean graph.</p>
        ) : (
          <ul className="findings">
            {graph.findings.map((f, i) => (
              <li
                key={i}
                className={`finding ${f.cardId ? 'is-clickable' : ''}`}
                onClick={() => f.cardId && selectCard(f.cardId)}
                title={f.cardId ? 'Go to card' : undefined}
              >
                <span className="finding__kind">{f.kind.replace(/_/g, ' ')}</span>
                <span className="finding__detail">{f.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Facts (data-flow model) */}
      <section className="analysis__section">
        <h3 className="analysis__h">
          Facts <span className="analysis__count">{graph.facts.length}</span>
        </h3>
        {graph.facts.length === 0 ? (
          <p className="analysis__empty">No data flow detected yet.</p>
        ) : (
          <ul className="facts-list">
            {graph.facts.map((f) => (
              <FactRow key={f.name} fact={f} />
            ))}
          </ul>
        )}
      </section>

      {/* Branches */}
      <section className="analysis__section">
        <h3 className="analysis__h">
          Branches <span className="analysis__count">{graph.branches.length}</span>
        </h3>
        {graph.branches.length === 0 ? (
          <p className="analysis__empty">No branches on the board.</p>
        ) : (
          graph.branches.map((b) => (
            <div className="branch-card" key={b.cardId}>
              <div className="branch-card__q">{b.question || labelOf(b.cardId)}</div>
              <ul className="branch-card__paths">
                {b.paths.map((p, i) => (
                  <li key={i} className={p.targetId ? '' : 'is-missing'}>
                    <span className="branch-card__label">{p.label}</span>
                    <span className="branch-card__arrow">→</span>
                    <span className="branch-card__target">{p.targetId ? labelOf(p.targetId) : 'no path'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* Structure summary */}
      <section className="analysis__section analysis__meta">
        <div>
          <span className="analysis__metak">entry</span> {labelOf(graph.entry)}
        </div>
        <div>
          <span className="analysis__metak">terminals</span> {graph.terminals.length}
        </div>
      </section>
    </div>
  );
}

function FactRow({ fact }: { fact: Fact }) {
  const neverProduced = fact.consumedBy.length > 0 && fact.producedBy.length === 0;
  const unused = fact.producedBy.length > 0 && fact.consumedBy.length === 0;
  const state = neverProduced ? 'is-gap' : unused ? 'is-unused' : 'is-ok';
  return (
    <li className={`fact ${state}`}>
      <span className="fact__name">{fact.name}</span>
      <span className="fact__flow">
        <span title="produced by">↑{fact.producedBy.length}</span>
        <span title="consumed by">↓{fact.consumedBy.length}</span>
      </span>
      {neverProduced && <span className="fact__flag" title="Consumed but never produced">✗</span>}
    </li>
  );
}
