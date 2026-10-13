import { expectedProgress, taskStatus, todayKst, type Task } from '@kingtepad/shared';
import { Link } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { ProgressBar, StatusBadge } from './StatusBadge';

export function TaskRow({ task }: { task: Task }) {
  const { holidays, categoryById } = useApp();
  const today = todayKst();
  const cat = categoryById(task.category_id);
  const expected = expectedProgress(task.planned_start, task.planned_end, today, holidays);

  return (
    <Link to={`/tasks/${task.id}`} className="card task-row">
      <span className="dot" style={{ background: cat?.color ?? '#94a3b8' }} title={cat?.name ?? '미분류'} />
      <span className="task-title">
        {task.title}
        {task.tags.length > 0 && (
          <span className="tags">
            {task.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="muted task-period">
        {task.planned_start.slice(5)} ~ {task.planned_end.slice(5)}
      </span>
      <ProgressBar value={task.progress} expected={expected} />
      <StatusBadge status={taskStatus(task, today, holidays)} />
    </Link>
  );
}
