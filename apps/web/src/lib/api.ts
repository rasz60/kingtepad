// Fastify API (Oracle Cloud) 호출. 배포 시 Caddy 가 /api/* 를 API 로 넘긴다.
import { supabase } from './supabase';

export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

/** Supabase 토큰을 붙여 API 를 부른다. 쿠키(에이전트 모니터 세션)도 주고받는다 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_URL) throw new Error('VITE_API_URL 이 설정되지 않았어요. apps/web/.env 를 확인하세요.');
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res;
}

/** API 기준 WebSocket 주소 (http→ws, https→wss) */
export function apiWsUrl(path: string): string {
  const url = new URL(`${API_URL}${path}`, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
