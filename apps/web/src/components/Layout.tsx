import { formatMinutes, todayKst } from '@kingtepad/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { listLogs, listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';
import { InstallBanner } from './Install';
import { LogForm } from './LogForm';
import { NotificationCenter } from './Notifications';
import { Pixel, type PixelName } from './Pixel';
import { TaskForm } from './TaskForm';

// short = 모바일 하단 탭에 아이콘과 함께 보이는 이름
const TABS: { to: string; file: string; short: string; icon: PixelName }[] = [
  { to: '/', file: '오늘.log', short: '오늘', icon: 'sun' },
  { to: '/tasks', file: '업무.txt', short: '업무', icon: 'doc' },
  { to: '/calendar', file: '캘린더.ics', short: '캘린더', icon: 'calendar' },
  { to: '/reports', file: '보고서.md', short: '보고서', icon: 'chart' },
  { to: '/monitor', file: '에이전트.exe', short: '에이전트', icon: 'monitor' },
  { to: '/settings', file: '설정.ini', short: '설정', icon: 'gear' },
];

const FILE_TYPE: Record<string, string> = {
  md: 'Markdown',
  ini: 'MS ini file',
  ics: 'iCalendar file',
  exe: 'Executable',
};

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayKst();
  const [modal, setModal] = useState<'task' | 'log' | null>(null);
  const [q, setQ] = useState('');

  // 상태 표시줄: 오늘 투입 시간
  const todayLogs = useAsync(() => listLogs({ from: today, to: today }), [today]);
  const todayMinutes = (todayLogs.data ?? []).reduce((s, l) => s + l.minutes, 0);
  // 일지 작성 시 업무 선택 목록
  const activeTasks = useAsync(async () => (await listTasks()).filter((t) => t.progress < 100), []);

  const tab = TABS.find((t) => (t.to === '/' ? location.pathname === '/' : location.pathname.startsWith(t.to))) ?? TABS[0]!;
  const dow = DOW[new Date(`${today}T00:00:00+09:00`).getDay()];

  useEffect(() => {
    document.title = `${tab.file} - 업무일지++`;
  }, [tab.file]);

  // Notepad++ 스타일 단축키: Alt+N 새 업무, Alt+L 일지
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'n' || e.key === 'N') (e.preventDefault(), setModal('task'));
      if (e.key === 'l' || e.key === 'L') (e.preventDefault(), setModal('log'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function search(e: FormEvent) {
    e.preventDefault();
    navigate(q.trim() ? `/tasks?q=${encodeURIComponent(q.trim())}` : '/tasks');
  }

  return (
    <div className="window">
      <header className="titlebar">
        <Pixel name="turtle" scale={1.4} />
        <span className="titlebar-text">
          {tab.file} - 업무일지++
        </span>
        <span className="win-buttons" aria-hidden>
          <i>_</i>
          <i>□</i>
          <i className="x">×</i>
        </span>
      </header>

      <div className="toolbar">
        <button className="tool" onClick={() => setModal('task')} title="새 업무 (Alt+N)">
          <Pixel name="plus" />
          <span>새 업무</span>
        </button>
        <button className="tool" onClick={() => setModal('log')} title="일지 쓰기 (Alt+L)">
          <Pixel name="pencil" />
          <span>일지 쓰기</span>
        </button>
        <span className="tool-sep" />
        <form className="tool-search" onSubmit={search}>
          <Pixel name="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="찾기…" aria-label="업무 검색" />
        </form>
        <span className="tool-date">
          {today} ({dow})
        </span>
        <NotificationCenter />
      </div>

      <nav className="tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab" aria-label={t.short}>
            <Pixel name={t.icon} scale={1.2} />
            <span className="tab-file">{t.file}</span>
            <span className="tab-short">{t.short}</span>
          </NavLink>
        ))}
      </nav>

      <InstallBanner />

      <main className="editor">
        <Outlet />
      </main>

      <footer className="statusbar">
        <span className="sb-grow">{FILE_TYPE[tab.file.split('.').pop()!] ?? 'Normal text file'}</span>
        <span>오늘 투입: {formatMinutes(todayMinutes)}</span>
        <span className="sb-hide">일지 {todayLogs.data?.length ?? 0}개</span>
        <span className="sb-hide">Asia/Seoul</span>
        <span className="sb-hide">UTF-8</span>
        <span>INS</span>
      </footer>

      {modal === 'task' && (
        <TaskForm
          onClose={() => setModal(null)}
          onSaved={(t) => {
            setModal(null);
            navigate(`/tasks/${t.id}`);
          }}
        />
      )}
      {modal === 'log' && (
        <LogForm tasks={activeTasks.data ?? []} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
      )}
    </div>
  );
}
