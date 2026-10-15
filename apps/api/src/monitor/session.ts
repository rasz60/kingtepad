// 에이전트 모니터 세션 쿠키.
// 픽셀 오피스 iframe 과 WebSocket 은 Authorization 헤더를 붙일 수 없어서,
// Supabase 토큰으로 로그인을 확인한 뒤(POST /monitor/session) HMAC 서명 쿠키를 발급한다.
// 쿠키는 포트를 구분하지 않으므로 같은 호스트의 오피스 프록시 포트에도 그대로 전달된다.
import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const COOKIE_NAME = 'kt_monitor';
const MAX_AGE_SEC = 12 * 60 * 60;

// 비우면 프로세스마다 새로 만든다 (재시작하면 세션이 끊기지만 탭을 열 때 다시 발급된다)
const secret = process.env.MONITOR_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const sign = (data: string) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function createToken(userId: string): string {
  const data = Buffer.from(JSON.stringify({ u: userId, exp: Date.now() + MAX_AGE_SEC * 1000 })).toString('base64url');
  return `${data}.${sign(data)}`;
}

function verifyToken(token: string | undefined): string | null {
  const [data, sig] = token?.split('.') ?? [];
  if (!data || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(data));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8')) as { u?: string; exp?: number };
    return u && exp && Date.now() < exp ? u : null;
  } catch {
    return null;
  }
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** 세션 쿠키의 사용자 id. 없거나 만료면 null */
export function sessionUser(req: IncomingMessage): string | null {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

/** HTTPS 뒤(Caddy)에 있으면 Secure 를 붙인다 */
export function sessionCookie(userId: string | null, secure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=${userId ? encodeURIComponent(createToken(userId)) : ''}`,
    'Path=/',
    `Max-Age=${userId ? MAX_AGE_SEC : 0}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
