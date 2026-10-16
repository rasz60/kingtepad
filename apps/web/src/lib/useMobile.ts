import { useSyncExternalStore } from 'react';

// styles.css 의 모바일 구간(@media (max-width: 640px))과 같은 기준
const QUERY = '(max-width: 640px)';

function subscribe(onChange: () => void) {
  const m = window.matchMedia(QUERY);
  m.addEventListener('change', onChange);
  return () => m.removeEventListener('change', onChange);
}

/** 모바일 화면 폭인지. CSS 만으로 안 되는 동작(입력줄 위치, 탭해서 수정)에만 쓴다 */
export function useMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
