import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AppProvider } from './lib/AppContext';
import { Calendar } from './pages/Calendar';
import { Login } from './pages/Login';
import { Monitor } from './pages/Monitor';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { TaskDetail } from './pages/TaskDetail';
import { Tasks } from './pages/Tasks';
import { Today } from './pages/Today';
import 'galmuri/dist/galmuri.css';
import './styles.css';

// ae:p 포털(같은 도메인) 아래 /diary/ 에서 돈다. vite.config.ts 의 base 와 같은 값
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '');

/** 로그인은 포털이 한다. 세션이 없으면 포털 로그인으로 보내고, 로그인 뒤 지금 주소로 돌아온다 */
function ToPortalLogin() {
  useEffect(() => {
    location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, []);
  return null;
}

// 포털 앱 전환 버튼(<aep-switcher>)을 정의하는 스크립트. index.html 에 두면 vite 가 번들하려 하므로 실행 중에 붙인다
if (!import.meta.env.DEV) {
  const s = Object.assign(document.createElement('script'), { type: 'module', src: '/shell/switcher.js' });
  document.head.append(s);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      {(ready, session) =>
        !ready ? null : !session ? (
          // 개발 서버에는 포털이 없으므로 예전 로그인 화면을 쓴다
          import.meta.env.DEV ? <Login /> : <ToPortalLogin />
        ) : (
          <BrowserRouter basename={BASENAME}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Today />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="calendar" element={<Calendar />} />
                <Route path="reports" element={<Reports />} />
                <Route path="monitor" element={<Monitor />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        )
      }
    </AppProvider>
  </StrictMode>,
);
