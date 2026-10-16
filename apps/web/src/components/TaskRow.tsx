import { expectedProgress, taskStatus, todayKst, type Task } from '@kingtepad/shared';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { ProgressBar, StatusBadge } from './StatusBadge';

/** 편집기 한 줄처럼 보이는 업무 행 */
export function TaskRow({ task }: { task: Task }) {
  const { holidays, categoryById } = useApp();
  const today = todayKst();
  const cat = categoryById(task.category_id);
  const expected = expectedProgress(task.planned_start, task.planned_end, today, holidays);

  return (
    <Link to={`/tasks/${task.id}`} className="ln task-line">
      <StatusBadge status={taskStatus(task, today, holidays)} />
      <span className="task-main">
        <span className="kw" title={cat?.name ?? '미분류'}>
          <i className="swatch" style={{ background: cat?.color ?? '#94a3b8' }} />
          <span className="task-cat">{cat?.name ?? '미분류'} </span>
        </span>
        <span className="task-title">{task.title}</span>
        <span className="task-tags">
          {task.tags.map((t) => (
            <span key={t} className="str">
              {' '}"{t}"
            </span>
          ))}
        </span>
      </span>
      <span className="num task-period">
        {task.planned_start.slice(5)}~{task.planned_end.slice(5)}
      </span>
      <ProgressBar value={task.progress} expected={expected} />
      <span className="num task-pct">{task.progress}%</span>
    </Link>
  );
}
