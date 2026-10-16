// 웹 푸시 구독과 서비스워커는 ae:p 포털이 맡는다 (포털 계정 메뉴 → 푸시 알림).
// 여기서는 같은 앱(같은 도메인 PWA)의 아이콘 숫자 배지만 갱신한다.

/** 앱 아이콘 숫자 배지 (지원하는 브라우저·설치된 PWA 에서만) */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  (count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
}
