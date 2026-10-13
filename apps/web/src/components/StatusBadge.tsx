import { STATUS_LABEL, type TaskStatus } from '@kingtepad/shared';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function ProgressBar({ value, expected }: { value: number; expected?: number | null }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${value}%` }} />
      {expected != null && <div className="progress-expected" style={{ left: `${expected}%` }} title={`예상 ${expected}%`} />}
    </div>
  );
}
