import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL, apiFetch, apiWsUrl } from '../lib/api';

// 에이전트 모니터: 배치 작업 상태를 픽셀 오피스(pixel-agents) 캐릭터와 실시간 로그로 보여준다.
// 실패·완료 알림은 API 가 알림함(🔔)과 웹 푸시로 보낸다.

interface AgentStatus {
  agentId: string;
  status: string;
  message: string;
  updatedAt: number;
}

type ServerMessage =
  | { type: 'snapshot'; recent: AgentStatus[]; pixelAgentsReady: boolean }
  | { type: 'agentUpdate'; agent: AgentStatus }
  | { type: 'pixelAgentsReady' };

type Conn = 'connecting' | 'online' | 'offline';
/** 모바일에서 한 번에 보여 줄 화면 (데스크톱은 오피스와 로그를 나란히 보여 주므로 쓰지 않는다) */
type View = 'office' | 'log';

const LOG_MAX = 50;
const RETRY_MS = 3_000;
const ALERT_STATUSES = new Set(['ERROR', 'FAILED', 'COMPLETE']);

// 픽셀 오피스 프록시 주소. 비우면 지금 접속한 호스트의 8081 포트
const OFFICE_URL =
  (import.meta.env.VITE_MONITOR_OFFICE_URL as string | undefined) || `${location.protocol}//${location.hostname}:8081`;

const CONN_TEXT: Record<Conn, string> = { connecting: '연결 중…', online: '실시간 연결됨', offline: '재연결 대기 중…' };

export function Monitor() {
  const [conn, setConn] = useState<Conn>('connecting');
  const [error, setError] = useState('');
  const [log, setLog] = useState<AgentStatus[]>([]);
  const [officeReady, setOfficeReady] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [view, setView] = useState<View>('office');
  const [unread, setUnread] = useState(0);
  const viewRef = useRef(view);
  viewRef.current = view;

  // 에이전트별 최신 상태 (log 는 최신순)
  const latest = useMemo(() => {
    const seen = new Map<string, AgentStatus>();
    for (const a of log) if (!seen.has(a.agentId)) seen.set(a.agentId, a);
    return [...seen.values()];
  }, [log]);

  function openView(v: View) {
    setView(v);
    if (v === 'log') setUnread(0);
  }

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    async function connect() {
      setConn('connecting');
      try {
        // 세션 쿠키를 (재)발급받은 뒤 연결한다. 오피스 iframe 도 이 쿠키로 열린다
        const res = (await (await apiFetch('/monitor/session', { method: 'POST' })).json()) as { pixelAgentsReady: boolean };
        if (closed) return;
        setError('');
        if (res.pixelAgentsReady) setOfficeReady(true);
      } catch (e) {
        if (closed) return;
        setError((e as Error).message);
        setConn('offline');
        retry = setTimeout(connect, RETRY_MS);
        return;
      }

      ws = new WebSocket(apiWsUrl('/monitor/ws'));
      ws.onopen = () => setConn('online');
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === 'snapshot') {
          setLog(msg.recent);
          if (msg.pixelAgentsReady) setOfficeReady(true);
        } else if (msg.type === 'agentUpdate') {
          setLog((l) => [msg.agent, ...l].slice(0, LOG_MAX));
          if (viewRef.current !== 'log') setUnread((n) => n + 1);
          // 알림함은 API 가 채우므로 잠시 뒤 🔔 를 새로 고친다
          if (ALERT_STATUSES.has(msg.agent.status)) setTimeout(() => window.dispatchEvent(new Event('kp:notifications')), 1_500);
        } else if (msg.type === 'pixelAgentsReady') {
          setOfficeReady(true);
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setConn('offline');
        retry = setTimeout(connect, RETRY_MS);
      };
    }

    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  if (!API_URL) {
    return (
      <div className="doc">
        <p className="ln comment">; 에이전트 모니터는 API 서버가 필요해요.</p>
        <p className="ln comment">; apps/web/.env 에 VITE_API_URL 을 설정하세요.</p>
      </div>
    );
  }

  return (
    <div className={`monitor monitor-view-${view}${showLog ? '' : ' monitor-log-off'}`}>
      <div className="monitor-bar">
        <span className={`monitor-dot monitor-${conn}`} aria-hidden title={CONN_TEXT[conn]} />
        <span className="monitor-conn">{CONN_TEXT[conn]}</span>
        {error && <span className="error">{error}</span>}
        {/* 모바일 전용: 오피스 / 로그 전환 */}
        <span className="seg monitor-seg" role="tablist">
          <button className={`seg-btn${view === 'office' ? ' active' : ''}`} role="tab" aria-selected={view === 'office'} onClick={() => openView('office')}>
            오피스
          </button>
          <button className={`seg-btn${view === 'log' ? ' active' : ''}`} role="tab" aria-selected={view === 'log'} onClick={() => openView('log')}>
            로그{unread > 0 && <span className="monitor-unread num">{unread > 9 ? '9+' : unread}</span>}
          </button>
        </span>
        <span className="monitor-actions">
          <button className="btn-ghost monitor-log-toggle" onClick={() => setShowLog((v) => !v)} aria-pressed={showLog}>
            상태 로그
          </button>
          {officeReady && (
            <a className="btn-ghost" href={OFFICE_URL} target="_blank" rel="noreferrer">
              새 창
            </a>
          )}
        </span>
      </div>

      {/* 모바일 전용: 에이전트별 최신 상태. 누르면 로그로 */}
      {latest.length > 0 && (
        <div className="monitor-agents">
          {latest.map((a) => (
            <button key={a.agentId} className="monitor-agent" onClick={() => openView('log')} title={a.message}>
              <span className="type">{a.agentId}</span>
              <span className={`monitor-status monitor-st-${a.status.toLowerCase()}`}>{a.status}</span>
            </button>
          ))}
        </div>
      )}

      <div className="monitor-body">
        {/* officeReady 는 세션 쿠키를 받은 뒤에만 켜지므로 iframe 이 401 로 열리지 않는다 */}
        <div className="monitor-office">
          {officeReady ? (
            <iframe className="monitor-frame" src={OFFICE_URL} title="픽셀 오피스" />
          ) : (
            <div className="monitor-wait comment">// 픽셀 오피스 준비 중… (서버 첫 실행은 1분 정도 걸려요)</div>
          )}
        </div>

        {/* 데스크톱에서 '상태 로그'를 끄면 CSS 로 숨긴다 (모바일은 로그 탭에서 항상 보인다) */}
        <aside className="monitor-log" aria-label="상태 로그">
          {log.length === 0 && <p className="monitor-empty comment">// 수신된 상태가 없어요</p>}
          {log.map((a) => (
            <div key={`${a.agentId}-${a.updatedAt}`} className="monitor-entry">
              <div className="monitor-entry-head">
                <span className="type">{a.agentId}</span>
                <span className={`monitor-status monitor-st-${a.status.toLowerCase()}`}>{a.status}</span>
              </div>
              {a.message && <div className="monitor-msg">{a.message}</div>}
              <div className="monitor-time num">{new Date(a.updatedAt).toLocaleTimeString('ko-KR')}</div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
