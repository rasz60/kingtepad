import { useState } from 'react';
import { useInstall } from '../lib/install';
import { Pixel } from './Pixel';

const DISMISS_KEY = 'kp:install-dismissed';

const IOS_GUIDE = 'Safari 아래쪽 공유 버튼(⬆) → "홈 화면에 추가"';

/** 설정.ini 의 [앱] 줄 */
export function InstallSetting() {
  const { state, install } = useInstall();
  if (state === 'installed') return <span className="str">"설치됨"</span>;
  if (state === 'prompt')
    return (
      <button className="btn-primary" onClick={install}>
        앱 설치
      </button>
    );
  return <span className="comment">// {state === 'ios' ? IOS_GUIDE : '브라우저 메뉴 → "앱 설치" (또는 "홈 화면에 추가")'}</span>;
}

/** 설치할 수 있을 때 한 번 보여 주는 안내 줄. 닫으면 다시 안 뜬다 (설정.ini 에서는 계속 설치 가능) */
export function InstallBanner() {
  const { state, install } = useInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed || (state !== 'prompt' && state !== 'ios')) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 저장 못 해도 이번 화면에서는 닫힌다 */
    }
  };

  return (
    <div className="install-bar" role="note">
      <span className="install-text">
        {state === 'prompt' ? '앱으로 설치하면 전체 화면으로 열리고 푸시 알림도 받을 수 있어요.' : `앱으로 설치: ${IOS_GUIDE}`}
      </span>
      {state === 'prompt' && (
        <button className="btn-primary" onClick={install}>
          설치
        </button>
      )}
      <button className="toast-close" onClick={close} aria-label="닫기">
        <Pixel name="close" />
      </button>
    </div>
  );
}
