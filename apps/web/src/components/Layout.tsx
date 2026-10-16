import { formatMinutes, todayKst } from '@kingtepad/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { listLogs, listTasks } from '../lib/db';
import { useAsync } from '../lib/useAsync';
import { LogForm } from './LogForm';
import { NotificationCenter } from './Notifications';
import { Pixel, type PixelName } from './Pixel';
import { TaskForm } from './TaskForm';
import { supabase } from '../lib/supabase';

// short = 모바일 하단 탭에 아이콘과 함께 보이는 이름
interface Tab {
  to: string;
  file: string;
  short: string;
  icon: PixelName;
}

// 경로는 /diary 기준 (main.tsx 의 basename)
const TABS: Tab[] = [
  { to: '/', file: '오늘.log', short: '오늘', icon: 'sun' },
  { to: '/tasks', file: '업무.txt', short: '업무', icon: 'doc' },
  { to: '/calendar', file: '캘린더.ics', short: '캘린더', icon: 'calendar' },
  { to: '/reports', file: '보고서.md', short: '보고서', icon: 'chart' },
  { to: '/settings', file: '설정.ini', short: '설정', icon: 'gear' },
];
// 에이전트 모니터는 별도 앱으로 떼어 내기 전까지 여기 있지만 탭에는 없다 (포털 앱 목록으로 들어온다)
const MONITOR: Tab = { to: '/monitor', file: '에이전트.exe', short: '에이전트', icon: 'monitor' };

const FILE_TYPE: Record<string, string> = {
  md: 'Markdown',
  ini: 'MS ini file',
  ics: 'iCalendar file',
  exe: 'Executable',
};
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const isUnder = (path: string, to: string) => (to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`));

/** 화면(Outlet)에 넘기는 값 */
export interface LayoutContext {
  /** 모바일 빠른 입력줄 자리 (하단 탭 바로 위) */
  dock: HTMLDivElement | null;
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const today = todayKst();
  const [modal, setModal] = useState<'task' | 'log' | null>(null);
  const [q, setQ] = useState('');
  const [dock, setDock] = useState<HTMLDivElement | null>(null);

  // 상태 표시줄: 오늘 투입 시간
  const todayLogs = useAsync(() => listLogs({ from: today, to: today }), [today]);
  const todayMinutes = (todayLogs.data ?? []).reduce((s, l) => s + l.minutes, 0);
  // 일지 작성 시 업무 선택 목록
  const activeTasks = useAsync(async () => (await listTasks()).filter((t) => t.progress < 100), []);

  const tab = [...TABS, MONITOR].find((t) => isUnder(location.pathname, t.to)) ?? TABS[0]!;
  // 에이전트 모니터는 포털에서 별도 앱으로 들어온다: 업무일지 버튼·탭·상태 표시줄 없이 보여 준다
  const agent = tab === MONITOR;
  const appName = agent ? 'ae:p' : '업무일지++';
  const dow = DOW[new Date(`${today}T00:00:00+09:00`).getDay()];

  useEffect(() => {
    document.title = `${tab.file} - ${appName}`;
  }, [tab.file, appName]);

  // Notepad++ 스타일 단축키: Alt+N 새 업무, Alt+L 일지
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || agent) return;
      if (e.key === 'n' || e.key === 'N') (e.preventDefault(), setModal('task'));
      if (e.key === 'l' || e.key === 'L') (e.preventDefault(), setModal('log'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [agent]);

  function search(e: FormEvent) {
    e.preventDefault();
    navigate(q.trim() ? `/tasks?q=${encodeURIComponent(q.trim())}` : '/tasks');
  }

  return (
    <div className="window">
      <header className="titlebar">
        <Pixel name={agent ? 'monitor' : 'turtle'} scale={1.4} />
        <span className="titlebar-text">
          {tab.file} - {appName}
        </span>
        <span className="win-buttons" aria-hidden>
          <i>_</i>
          <i>□</i>
          <i className="x" onClick={() => supabase.auth.signOut()}>×</i>
        </span>
      </header>

      <div className="toolbar">
        {/* ae:p 앱 전환 버튼 (포털의 /shell/switcher.js 가 그린다) */}
        <aep-switcher mode="inline" className="tool-switcher" />
        {/* 모바일 전용: 타이틀바 대신 거북이 + 지금 파일 이름 */}
        <span className="tool-brand">
          <Pixel name={agent ? 'monitor' : 'turtle'} scale={1.4} />
          <span className="tool-brand-text">{tab.file}</span>
        </span>
        {!agent && (
          <>
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
          </>
        )}
        <span className="tool-date">
          {today} ({dow})
        </span>
        <NotificationCenter />
      </div>

      {!agent && (
        <nav className="tabs">
          {/* 포털 홈 (다른 빌드라 라우터 링크가 아니라 페이지 이동) */}
          <a href="/" className="tab tab-back" aria-label="ae:p 홈">
            <Pixel name="home" scale={1.2} />
            <span className="tab-file">홈</span>
            <span className="tab-short">홈</span>
          </a>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab" aria-label={t.short}>
              <Pixel name={t.icon} scale={1.2} />
              <span className="tab-file">{t.file}</span>
              <span className="tab-short">{t.short}</span>
            </NavLink>
          ))}
        </nav>
      )}

      <main className="editor">
        <Outlet context={{ dock } satisfies LayoutContext} />
      </main>

      <div className="dock" ref={setDock} />

      <footer className="statusbar">
        <span className="sb-grow">{FILE_TYPE[tab.file.split('.').pop()!] ?? 'Normal text file'}</span>
        {!agent && (
          <>
            <span>오늘 투입: {formatMinutes(todayMinutes)}</span>
            <span className="sb-hide">일지 {todayLogs.data?.length ?? 0}개</span>
          </>
        )}
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
