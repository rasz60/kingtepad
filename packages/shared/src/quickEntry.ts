/**
 * 한 줄 빠른 입력 파서
 *   "#개발 로그인 API 수정 1h30m 60%"
 *   → { category: '개발', text: '로그인 API 수정', minutes: 90, progress: 60 }
 */
export interface QuickEntry {
  category: string | null;
  text: string;
  minutes: number;
  progress: number | null;
}

const CATEGORY_RE = /(?:^|\s)#(\S+)/;
const TIME_RE = /(?:^|\s)(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?(?=\s|$)/gi;
const PROGRESS_RE = /(?:^|\s)(\d{1,3})%(?=\s|$)/;

export function parseQuickEntry(input: string): QuickEntry {
  let rest = ` ${input.trim()} `;

  let category: string | null = null;
  const cat = rest.match(CATEGORY_RE);
  if (cat) {
    category = cat[1]!;
    rest = rest.replace(cat[0], ' ');
  }

  let progress: number | null = null;
  const prog = rest.match(PROGRESS_RE);
  if (prog) {
    progress = Math.min(100, Number(prog[1]));
    rest = rest.replace(prog[0], ' ');
  }

  let minutes = 0;
  rest = rest.replace(TIME_RE, (match, h?: string, m?: string) => {
    if (!h && !m) return match;
    minutes += Math.round(Number(h ?? 0) * 60) + Number(m ?? 0);
    return ' ';
  });

  return { category, text: rest.replace(/\s+/g, ' ').trim(), minutes, progress };
}
