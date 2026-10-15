// 픽셀 오피스(pixel-agents) 터치 지원. pixel-agents 는 마우스 휠로만 화면 이동/줌을 받으므로
// (휠 = 이동, Ctrl+휠 = 줌) 터치 제스처를 같은 휠 이벤트로 바꿔 캔버스에 보낸다.
//   한 손가락 드래그 → 휠 이동,  두 손가락 핀치 → Ctrl+휠 줌,  탭 → 그대로 클릭(캐릭터 선택)
// 오피스 프록시가 pixel-agents 의 index.html 에 이 스크립트를 끼워 넣는다 (pixel-agents 자체는 수정하지 않는다).

/** 핀치 거리 1px 당 휠 deltaY. pixel-agents 는 deltaY 누적 50 마다 줌 한 단계 → 손가락 약 50px 벌리면 한 단계 */
const PINCH_GAIN = 1;

const script = `(() => {
  const style = document.createElement('style');
  style.textContent = 'canvas { touch-action: none; }';
  document.head.appendChild(style);

  const points = (touches) => Array.from(touches, (t) => ({ x: t.clientX, y: t.clientY }));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wheel = (el, x, y, dx, dy, ctrl) =>
    el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: x, clientY: y, deltaX: dx, deltaY: dy, ctrlKey: ctrl }));

  let last = null;
  let span = 0;
  const reset = (touches) => {
    last = touches.length ? points(touches) : null;
    span = last && last.length > 1 ? dist(last[0], last[1]) : 0;
  };

  addEventListener('touchstart', (e) => { if (e.target.tagName === 'CANVAS') reset(e.touches); }, { passive: true });
  addEventListener('touchend', (e) => reset(e.touches), { passive: true });
  addEventListener('touchcancel', (e) => reset(e.touches), { passive: true });
  addEventListener('touchmove', (e) => {
    if (!last || e.target.tagName !== 'CANVAS') return;
    e.preventDefault();
    const p = points(e.touches);
    if (p.length > 1 && last.length > 1) {
      const next = dist(p[0], p[1]);
      wheel(e.target, (p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, 0, (span - next) * ${PINCH_GAIN}, true);
      span = next;
      last = p;
    } else if (p.length === 1 && last.length === 1) {
      // 손가락을 오른쪽으로 끌면 화면도 오른쪽으로 (휠은 반대 방향)
      wheel(e.target, p[0].x, p[0].y, last[0].x - p[0].x, last[0].y - p[0].y, false);
      last = p;
    } else {
      reset(e.touches); // 손가락 수가 바뀌면 기준점만 다시 잡는다
    }
  }, { passive: false });
})();`;

/** pixel-agents index.html 의 </head> 앞에 터치 스크립트를 넣는다 */
export function injectTouchSupport(html: string): string {
  const tag = `<script>${script}</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${tag}</head>`) : html + tag;
}
