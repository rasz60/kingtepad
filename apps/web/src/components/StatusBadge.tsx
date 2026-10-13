import { STATUS_LABEL, type TaskStatus } from '@kingtepad/shared';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

/** 10칸짜리 픽셀 진척 막대. expected 는 ▼ 마커로 표시 */
export function ProgressBar({ value, expected }: { value: number; expected?: number | null }) {
  return (
    <span
      className="pbar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      title={expected != null ? `실제 ${value}% / 예상 ${expected}%` : `${value}%`}
    >
      <span className="pbar-fill" style={{ width: `${value}%` }} />
      {expected != null && <span className="pbar-expected" style={{ left: `${expected}%` }} />}
    </span>
  );
}
