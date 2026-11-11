import { STATUS_LABEL, type TaskStatus } from '@kingtepad/shared';

/** 상태 아이콘. 별도 폰트 없이 iOS·Android·Windows 기본 이모지로 표시된다 */
export const STATUS_ICON: Record<TaskStatus, string> = {
  planned: '⏳',
  in_progress: '▶️',
  delayed: '🚨',
  done: '✅',
  deleted: '🗑️',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-icon" aria-hidden>
        {STATUS_ICON[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
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
