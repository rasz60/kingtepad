import type { ReactElement } from 'react';

// 픽셀 아트 아이콘. 문자 격자를 SVG rect 로 그린다.
// k = 외곽선(테마 잉크색), 나머지 문자는 PALETTE 참고, '.' = 투명

const PALETTE: Record<string, string> = {
  k: 'var(--px-ink)',
  w: 'var(--px-white)',
  y: '#ffd23f',
  o: '#ff9f1c',
  r: '#ff5d73',
  p: '#ffa8c5',
  g: '#3ec46d',
  b: '#4d8dff',
  l: '#a8d4ff',
  s: '#9aa3ae',
};

const ICONS = {
  sun: [
    '.....y.....',
    '.y...y...y.',
    '..y.....y..',
    '....ooo....',
    '...ooooo...',
    'yy.ooooo.yy',
    '...ooooo...',
    '....ooo....',
    '..y.....y..',
    '.y...y...y.',
    '.....y.....',
  ],
  doc: [
    'kkkkkkk...',
    'kwwwwwkk..',
    'kwwwwwkwk.',
    'kwbbbwkkkk',
    'kwwwwwwwwk',
    'kwbbbbbbwk',
    'kwwwwwwwwk',
    'kwbbbbbbwk',
    'kwwwwwwwwk',
    'kwbbbbwwwk',
    'kwwwwwwwwk',
    'kkkkkkkkkk',
  ],
  chart: [
    'k..........',
    'k.......rr.',
    'k.......rr.',
    'k....gg.rr.',
    'k....gg.rr.',
    'k.bb.gg.rr.',
    'k.bb.gg.rr.',
    'k.bb.gg.rr.',
    'k.bb.gg.rr.',
    'k.bb.gg.rr.',
    'kkkkkkkkkkk',
  ],
  gear: [
    '....sss....',
    '.ss.sss.ss.',
    '.sssssssss.',
    '..sssssss..',
    'ssss...ssss',
    'sss.....sss',
    'ssss...ssss',
    '..sssssss..',
    '.sssssssss.',
    '.ss.sss.ss.',
    '....sss....',
  ],
  floppy: [
    'kkkkkkkkkk.',
    'kbwwwwwwbkk',
    'kbwwwwwwbbk',
    'kbwwwwwwbbk',
    'kbbbbbbbbbk',
    'kbbbbbbbbbk',
    'kbbsssssbbk',
    'kbbsskssbbk',
    'kbbsskssbbk',
    'kbbsssssbbk',
    'kkkkkkkkkkk',
  ],
  plus: [
    '...kkk...',
    '...kgk...',
    '...kgk...',
    'kkkkgkkkk',
    'kgggggggk',
    'kkkkgkkkk',
    '...kgk...',
    '...kgk...',
    '...kkk...',
  ],
  pencil: [
    '.......kk.',
    '......krrk',
    '.....kyykk',
    '....kyyyk.',
    '...kyyyk..',
    '..kyyyk...',
    '.kwyyk....',
    '.kwwk.....',
    'kkkk......',
  ],
  trash: [
    '...kkk...',
    'kkkkkkkkk',
    '.kwwwwwk.',
    '.kwkwkwk.',
    '.kwkwkwk.',
    '.kwkwkwk.',
    '.kwkwkwk.',
    '.kwwwwwk.',
    '..kkkkk..',
  ],
  search: [
    '.kkkk.....',
    'kllllk....',
    'klwllk....',
    'kllllk....',
    '.kkkkk....',
    '.....kk...',
    '......kk..',
    '.......kk.',
  ],
  close: [
    'kk....kk',
    '.kk..kk.',
    '..kkkk..',
    '...kk...',
    '..kkkk..',
    '.kk..kk.',
    'kk....kk',
  ],
  undo: [
    '...k......',
    '..kk......',
    '.kbkkkkk..',
    'kbbbbbbbk.',
    '.kbkkkkbbk',
    '..kk...kbk',
    '...k...kbk',
    '.......kbk',
    '....kkkbk.',
    '....kkkk..',
  ],
  copy: [
    '.kkkkkk...',
    '.kwwwwk...',
    'kkkkkkwk..',
    'kwwwwkwk..',
    'kwbbwkwk..',
    'kwwwwkkk..',
    'kwbbwk....',
    'kwwwwk....',
    'kkkkkk....',
  ],
  cat: [
    '.k.........k.',
    '.kk.......kk.',
    '.kpk.....kpk.',
    '.kwwkkkkkwwk.',
    'kwwwwwwwwwwwk',
    'kwwkwwwwwkwwk',
    'kwwkwwwwwkwwk',
    'kwpwwwkwwwpwk',
    'kwwwwkwkwwwwk',
    '.kwwwwwwwwwk.',
    '..kkkkkkkkk..',
  ],
} as const;

export type PixelName = keyof typeof ICONS;

/** scale = 픽셀 하나의 CSS px 크기 */
export function Pixel({ name, scale = 1.5, className }: { name: PixelName; scale?: number; className?: string }) {
  const rows = ICONS[name];
  const h = rows.length;
  const w = rows[0]!.length;
  const rects: ReactElement[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      if (c !== '.') rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={PALETTE[c]} />);
    }
  });
  return (
    <svg
      className={`pixel ${className ?? ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {rects}
    </svg>
  );
}

/** 빈 상태: 픽셀 고양이 + 말풍선 */
export function Empty({ children }: { children: string }) {
  return (
    <div className="ln empty">
      <Pixel name="cat" scale={2} />
      <span className="bubble">{children}</span>
    </div>
  );
}
