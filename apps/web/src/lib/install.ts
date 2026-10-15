// 앱(PWA) 설치. 크롬·엣지·안드로이드는 beforeinstallprompt 로 설치 창을 직접 띄우고,
// iOS 는 그런 API 가 없어서 Safari 공유 → '홈 화면에 추가' 안내만 할 수 있다.
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** installed = 앱으로 실행 중, prompt = 설치 버튼 가능, ios = 홈 화면에 추가 안내, manual = 브라우저 메뉴로 설치 */
export type InstallState = 'installed' | 'prompt' | 'ios' | 'manual';

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// 이벤트는 페이지 로드 직후 한 번만 오므로, 화면이 뜨기 전에(모듈 로드 시점) 받아 둔다
let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // 브라우저 기본 미니 배너 대신 우리 버튼으로 띄운다
  deferred = e as BeforeInstallPromptEvent;
  emit();
});
addEventListener('appinstalled', () => {
  deferred = null;
  installedNow = true;
  emit();
});

function currentState(): InstallState {
  if (installedNow || isStandalone()) return 'installed';
  if (deferred) return 'prompt';
  return isIos() ? 'ios' : 'manual';
}

export function useInstall() {
  const [state, setState] = useState(currentState);
  useEffect(() => {
    const update = () => setState(currentState());
    listeners.add(update);
    return () => void listeners.delete(update);
  }, []);

  /** 버튼 클릭 안에서 호출. 설치 창은 이벤트당 한 번만 띄울 수 있다 */
  async function install() {
    if (!deferred) return;
    const e = deferred;
    deferred = null;
    await e.prompt();
    await e.userChoice;
    emit();
  }

  return { state, install };
}
