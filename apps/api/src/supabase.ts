import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FastifyReply, FastifyRequest } from 'fastify';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY 가 필요합니다.');

declare module 'fastify' {
  interface FastifyRequest {
    db: SupabaseClient;
    userId: string;
  }
}

/**
 * Authorization: Bearer <supabase access token> 를 검증하고,
 * 해당 사용자 권한(RLS 적용)으로 동작하는 클라이언트를 request.db 에 붙인다.
 * service_role 키를 쓰지 않으므로 API 가 사용자 데이터 범위를 벗어날 수 없다.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return reply.code(401).send({ error: 'unauthorized' });

  const db = createClient(url!, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return reply.code(401).send({ error: 'unauthorized' });

  req.db = db;
  req.userId = data.user.id;
}
