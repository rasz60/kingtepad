import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Pixel } from './Pixel';

/** Windows 대화상자 스타일. 모바일에서는 하단 시트 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 열릴 때 포커스를 대화상자로 옮기고(입력칸이 autoFocus 면 그대로 둔다), 닫히면 열기 전 요소로 돌려준다
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, []);

  // Tab 이 대화상자 밖으로 나가지 않게 가둔다
  function trap(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) (e.preventDefault(), last.focus());
    else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={trap}>
        <header className="dialog-title">
          <Pixel name="pencil" scale={1.2} />
          <h2>{title}</h2>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="닫기">
            <Pixel name="close" scale={1.2} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
