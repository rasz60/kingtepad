import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AppProvider } from './lib/AppContext';
import { Login } from './pages/Login';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { TaskDetail } from './pages/TaskDetail';
import { Tasks } from './pages/Tasks';
import { Today } from './pages/Today';
import 'galmuri/dist/galmuri.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      {(ready, session) =>
        !ready ? null : !session ? (
          <Login />
        ) : (
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Today />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="tasks/:id" element={<TaskDetail />} />
                <Route path="reports" element={<Reports />} />
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
