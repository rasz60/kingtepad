import { formatMinutes, type WorkLog } from '@kingtepad/shared';
import type { MouseEvent, ReactNode } from 'react';
import { useMobile } from '../lib/useMobile';
import { Markdown } from './Markdown';

/**
 * 일지 한 건: [제목][시간][진척][수정·삭제] + 내용.
 * 모바일은 수정·삭제 글자를 숨기고 일지를 누르면 수정 시트가 열린다 (삭제는 시트 안에서)
 */
export function LogLine({
  log,
  title,
  onEdit,
  onDelete,
}: {
  log: WorkLog;
  title: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const mobile = useMobile();
  const tap =
    mobile && onEdit
      ? (e: MouseEvent) => !(e.target as Element).closest('a, button') && onEdit()
      : undefined;

  return (
    <div className={`ln log-line${tap ? ' tappable' : ''}`} onClick={tap}>
      <div className="log-head">
        {title}
        <span className="log-meta">
          <span className="dur">{formatMinutes(log.minutes)}</span>
          {log.progress != null && <span className="num">→ {log.progress}%</span>}
        </span>
        {(onEdit || onDelete) && (
          <span className="log-actions">
            {onEdit && (
              <button className="link-btn" onClick={onEdit}>
                수정
              </button>
            )}
            {onDelete && (
              <button className="link-btn danger" onClick={onDelete}>
                삭제
              </button>
            )}
          </span>
        )}
      </div>
      <Markdown source={log.content} />
    </div>
  );
}
