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
  d: '#1f8a4c',
  e: '#a8e07a',
  m: '#f6dfb8',
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
  bell: [
    '....k....',
    '...kyk...',
    '..kyyyk..',
    '..kyyyk..',
    '.kyyyyyk.',
    '.kyyyyyk.',
    'kyyyyyyyk',
    'kkkkkkkkk',
    '...kok...',
  ],
  calendar: [
    '..k.....k..',
    'kkkkkkkkkkk',
    'krrrrrrrrrk',
    'krrrrrrrrrk',
    'kkkkkkkkkkk',
    'kwwwwwwwwwk',
    'kwswswswswk',
    'kwwwwwwwwwk',
    'kwswswbwswk',
    'kwwwwwwwwwk',
    'kkkkkkkkkkk',
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
  monitor: [
    'kkkkkkkkkkk',
    'kbbbbbbbbbk',
    'kbgbbbbbbbk',
    'kbbgbbbbbbk',
    'kbgbbgggbbk',
    'kbbbbbbbbbk',
    'kbbbbbbbbbk',
    'kkkkkkkkkkk',
    '....kkk....',
    '..kkkkkkk..',
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
  home: [
    '.....k.....',
    '....krk....',
    '...krrrk...',
    '..krrrrrk..',
    '.krrrrrrrk.',
    'kkkkkkkkkkk',
    '.kwwwwwwwk.',
    '.kwllwoowk.',
    '.kwllwoowk.',
    '.kwwwwoowk.',
    '.kkkkkkkkk.',
  ],
  turtle: [
    '..kkkkkkk......',
    '.kgdgggdgk.kkk.',
    'kgdgdgdgdgkekek',
    'kggdgggdggkeeek',
    'kkkkkkkkkkkkkk.',
    '.kmmmmmmmmmk...',
    '.kek.....kek...',
    '.kkk.....kkk...',
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

/** 빈 상태: 픽셀 거북이 + 말풍선 */
export function Empty({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`ln empty ${className ?? ''}`}>
      <Pixel name="turtle" scale={2} />
      <span className="bubble">{children}</span>
    </div>
  );
}
