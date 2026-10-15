// 오피스 프록시가 pixel-agents 의 index.html 에 끼워 넣는 스크립트 (pixel-agents 자체는 수정하지 않는다).
//
// 1. 터치: pixel-agents 는 마우스 휠로만 화면 이동/줌을 받으므로 (휠 = 이동, Ctrl+휠 = 줌)
//    한 손가락 드래그 → 휠 이동,  두 손가락 핀치 → Ctrl+휠 줌,  탭 → 그대로 클릭(캐릭터 선택)
// 2. 쉬는 캐릭터 문구: pixel-agents 는 쉬는(Idle) 캐릭터 라벨을 항상 'Idle' 로 그린다.
//    잡이 보낸 label(예: '퇴근했습니다!😁')을 /__kt/labels 에서 받아 그 글자만 바꿔 보여 준다.

/** 핀치 거리 1px 당 휠 deltaY. pixel-agents 는 deltaY 누적 50 마다 줌 한 단계 → 손가락 약 50px 벌리면 한 단계 */
const PINCH_GAIN = 1;

const touchScript = `(() => {
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

/** 라벨을 다시 받아 오는 주기. 상태가 바뀌면 바로 반영할 필요는 없다 */
const LABEL_POLL_MS = 15_000;

// 라벨 DOM: [data-testid=agent-overlay] .pixel-panel > div > span(상태) + span(이름)
// React 는 자기 가상 DOM 값('Idle')이 바뀔 때만 글자를 다시 쓰므로, 바꿔 둔 글자는 상태가 바뀌기 전까지 유지된다.
const labelScript = `(() => {
  let labels = {};
  const apply = () => {
    for (const box of document.querySelectorAll('[data-testid=agent-overlay] .pixel-panel > div')) {
      const [status, name] = box.children;
      if (!status || !name) continue;
      // 바꿔 둔 글자를 React 가 다른 상태(Running 등)로 덮어썼으면 표시를 지운다
      if (status.dataset.kt && status.textContent !== status.dataset.kt) delete status.dataset.kt;
      const label = labels[name.textContent];
      if (status.dataset.kt) {
        if (label !== status.dataset.kt) { status.textContent = label || 'Idle'; label ? (status.dataset.kt = label) : delete status.dataset.kt; }
      } else if (label && status.textContent === 'Idle') {
        status.textContent = label;
        status.dataset.kt = label;
      }
    }
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; apply(); });
  }).observe(document.body, { subtree: true, childList: true, characterData: true });
  const load = () =>
    fetch('/__kt/labels', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})).then((l) => { labels = l; apply(); }).catch(() => {});
  load();
  setInterval(load, ${LABEL_POLL_MS});
})();`;

/** pixel-agents index.html 의 </head> 앞(라벨 스크립트는 body 가 필요해 </body> 앞)에 스크립트를 넣는다 */
export function injectOfficeScripts(html: string): string {
  const head = `<script>${touchScript}</script>`;
  const body = `<script>${labelScript}</script>`;
  html = html.includes('</body>') ? html.replace('</body>', `${body}</body>`) : html + body;
  return html.includes('</head>') ? html.replace('</head>', `${head}</head>`) : head + html;
}
