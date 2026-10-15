// 웹 푸시 구독. VAPID 공개키가 없거나 서비스 워커가 없으면(개발 서버) 비활성.
import { deletePushSubscription, savePushSubscription } from './db';
import { isIos, isStandalone } from './install';

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

async function registration() {
  if (!('serviceWorker' in navigator)) return undefined;
  return navigator.serviceWorker.getRegistration();
}

export async function getPushState(): Promise<PushState> {
  // iOS 는 홈 화면에 추가한 앱에서만 푸시를 받을 수 있다 (iOS 16.4+)
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!VAPID_KEY || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  const reg = await registration();
  if (!reg) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

/** 반드시 버튼 클릭 등 사용자 동작 안에서 호출 (iOS 권한 요청 조건) */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았어요.');
  const reg = await registration();
  if (!reg || !VAPID_KEY) throw new Error('푸시를 쓸 수 없는 환경이에요.');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_KEY) }));
  await savePushSubscription(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (!sub) return;
  await deletePushSubscription(sub.endpoint);
  await sub.unsubscribe();
}

/** 앱 아이콘 숫자 배지 (지원하는 브라우저·설치된 PWA 에서만) */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
}

function base64UrlToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
