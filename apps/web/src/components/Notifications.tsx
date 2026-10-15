import type { AppNotification, NotificationKind } from '@kingtepad/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../lib/AppContext';
import { clearReadNotifications, generateNotifications, listNotifications, markNotificationsRead } from '../lib/db';
import { disablePush, enablePush, getPushState, setAppBadge, type PushState } from '../lib/push';
import { useAsync } from '../lib/useAsync';
import { Pixel } from './Pixel';

const POLL_MS = 60_000;
const TOAST_MS = 7_000;
const TOAST_MAX = 3;
const TOASTED_KEY = 'kp:toasted';

const KIND_LABEL: Record<NotificationKind, string> = { alarm: '알람', delayed: '지연', due_soon: '마감 임박', agent: '에이전트' };

/** 알림함 데이터. 1분마다, 그리고 앱으로 돌아올 때 새 알림을 만들고 다시 불러온다 */
function useNotifications() {
  const { holidays } = useApp();
  const list = useAsync(async () => {
    // 공휴일이 아직 안 불러와졌으면 지연 판단이 틀릴 수 있어 생성은 건너뛴다 (API 스케줄러가 대신 만든다)
    if (holidays.size > 0) await generateNotifications(holidays).catch(() => {});
    return listNotifications();
  }, [holidays]);

  useEffect(() => {
    const id = setInterval(list.reload, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && list.reload();
    document.addEventListener('visibilitychange', onVisible);
    // 다른 화면에서 새 알림이 생겼다고 알려줄 때 (에이전트 모니터)
    window.addEventListener('kp:notifications', list.reload);
    return () => (
      clearInterval(id),
      document.removeEventListener('visibilitychange', onVisible),
      window.removeEventListener('kp:notifications', list.reload)
    );
  }, [list.reload]);

  const items = list.data ?? [];
  const unread = items.filter((n) => !n.read_at);
  useEffect(() => setAppBadge(unread.length), [unread.length]);
  return { items, unread, reload: list.reload };
}

function timeAgo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
}

/** 툴바의 🔔 버튼 + 알림 패널 + 하단 토스트 */
export function NotificationCenter() {
  const navigate = useNavigate();
  const { items, unread, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function openItem(n: AppNotification) {
    setOpen(false);
    if (!n.read_at) await markNotificationsRead([n.id]);
    reload();
    navigate(n.link);
  }

  // 패널 밖을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !panelRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => (document.removeEventListener('pointerdown', onDown), document.removeEventListener('keydown', onKey));
  }, [open]);

  return (
    <div className="notif" ref={panelRef}>
      <button className="tool notif-bell" onClick={() => setOpen((v) => !v)} title="알림" aria-label={`알림 ${unread.length}건`} aria-expanded={open}>
        <Pixel name="bell" />
        {unread.length > 0 && <span className="notif-count">{unread.length > 99 ? '99+' : unread.length}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="알림">
          <div className="notif-head">
            <strong>알림</strong> <span className="num">({unread.length})</span>
            <span className="notif-head-actions">
              <button className="link-btn" disabled={!unread.length} onClick={() => markNotificationsRead().then(reload)}>
                모두 읽음
              </button>
              <button
                className="link-btn danger"
                disabled={items.length === unread.length}
                onClick={() => clearReadNotifications().then(reload)}
              >
                읽은 알림 지우기
              </button>
            </span>
          </div>
          <div className="notif-list">
            {items.length === 0 && <p className="notif-empty comment">// 알림이 없어요</p>}
            {items.map((n) => (
              <button key={n.id} className={`notif-item ${n.read_at ? 'read' : ''}`} onClick={() => openItem(n)}>
                <span className={`notif-kind notif-${n.kind}`}>{KIND_LABEL[n.kind]}</span>
                <span className="notif-title">{n.title}</span>
                <span className="notif-body">
                  {n.body} <span className="comment">· {timeAgo(n.fire_at)}</span>
                </span>
              </button>
            ))}
          </div>
          <PushToggle />
        </div>
      )}

      <Toasts unread={unread} onOpen={openItem} onAll={() => setOpen(true)} />
    </div>
  );
}

/** 로그인·접속 시, 그리고 새 알림이 생길 때 하단에 잠깐 띄운다 (탭당 한 번) */
function Toasts({
  unread,
  onOpen,
  onAll,
}: {
  unread: AppNotification[];
  onOpen: (n: AppNotification) => void;
  onAll: () => void;
}) {
  type Toast = { id: string; n?: AppNotification; more?: number };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef<Set<string>>(new Set(JSON.parse(sessionStorage.getItem(TOASTED_KEY) ?? '[]') as string[]));

  useEffect(() => {
    const fresh = unread.filter((n) => !seen.current.has(n.id));
    if (fresh.length === 0) return;
    fresh.forEach((n) => seen.current.add(n.id));
    sessionStorage.setItem(TOASTED_KEY, JSON.stringify([...seen.current]));

    const added: Toast[] = fresh.slice(0, TOAST_MAX).map((n) => ({ id: n.id, n }));
    if (fresh.length > TOAST_MAX) added.push({ id: `more-${Date.now()}`, more: fresh.length - TOAST_MAX });
    setToasts((t) => [...t, ...added]);
    const ids = added.map((t) => t.id);
    setTimeout(() => setToasts((t) => t.filter((x) => !ids.includes(x.id))), TOAST_MS);
  }, [unread]);

  const dismiss = (id: string) => setToasts((t) => t.filter((x) => x.id !== id));

  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.n ? `toast-${t.n.kind}` : ''}`}>
          <button className="toast-main" onClick={() => (dismiss(t.id), t.n ? onOpen(t.n) : onAll())}>
            {t.n ? (
              <>
                <strong>{t.n.title}</strong>
                <span>{t.n.body}</span>
              </>
            ) : (
              <strong>외 {t.more}건의 알림이 더 있어요</strong>
            )}
          </button>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="닫기">
            <Pixel name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: '이 환경에서는 푸시 알림을 쓸 수 없어요.',
  'ios-install': '아이폰은 공유 → "홈 화면에 추가"로 설치한 앱에서 푸시를 받을 수 있어요.',
  denied: '알림이 차단돼 있어요. 브라우저/기기 설정에서 허용해 주세요.',
  off: '이 기기로 푸시 알림(배너·아이콘 숫자)을 받을 수 있어요.',
  on: '이 기기에서 푸시 알림을 받고 있어요.',
};

/** 이 기기의 웹 푸시 구독 켜기/끄기 */
export function PushToggle() {
  const state = useAsync(getPushState, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      await (state.data === 'on' ? disablePush() : enablePush());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
    state.reload();
  }

  if (!state.data) return null;
  return (
    <div className="push-toggle">
      <span className="comment">// {PUSH_TEXT[state.data]}</span>
      {(state.data === 'on' || state.data === 'off') && (
        <button className={state.data === 'on' ? 'btn-ghost' : 'btn-primary'} disabled={busy} onClick={toggle}>
          {state.data === 'on' ? '푸시 끄기' : '푸시 받기'}
        </button>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
