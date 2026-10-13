import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/', label: '오늘', icon: '☀️' },
  { to: '/tasks', label: '업무', icon: '📋' },
  { to: '/reports', label: '보고서', icon: '📊' },
  { to: '/settings', label: '설정', icon: '⚙️' },
];

export function Layout() {
  return (
    <div className="app">
      <nav className="nav">
        <span className="brand">업무 일지</span>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="nav-link">
            <span className="nav-icon" aria-hidden>
              {n.icon}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
