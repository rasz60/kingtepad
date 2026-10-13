import { useEffect, type ReactNode } from 'react';
import { Pixel } from './Pixel';

/** Windows 대화상자 스타일. 모바일에서는 하단 시트 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
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
