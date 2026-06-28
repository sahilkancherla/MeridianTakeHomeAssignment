import type { ProcessStatus } from '../../data/processes';

const META: Record<ProcessStatus, { label: string; mark: string; cls: string }> = {
  draft: { label: 'draft', mark: '◐', cls: 'status--draft' },
  in_review: { label: 'in review', mark: '◔', cls: 'status--review' },
  submitted: { label: 'submitted', mark: '●', cls: 'status--submitted' },
};

export function StatusBadge({ status, version }: { status: ProcessStatus; version?: number | null }) {
  const m = META[status];
  return (
    <span className={`status ${m.cls}`}>
      <span className="status__mark">{m.mark}</span>
      {m.label}
      {status === 'submitted' && version ? ` · v${version}` : ''}
    </span>
  );
}
