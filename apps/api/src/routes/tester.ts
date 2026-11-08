// 공용 테스터 계정 (P-0004)
//   POST /tester/reset  테스터가 새로 만든 데이터를 지운다 (기본 데이터는 남는다). 포털이 로그아웃 직전에 부른다.
//   사용자 토큰(RLS)으로 DB 함수 public.tester_reset 을 부른다. 함수가 자기 것만 지우게 막고, 테스터가 아니면 0 을 돌려준다.
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../supabase';

export async function testerRoutes(app: FastifyInstance) {
  app.post('/tester/reset', { preHandler: requireUser }, async (req, reply) => {
    const { data, error } = await req.db.rpc('tester_reset', { uid: req.userId });
    if (error) {
      req.log.error({ err: error }, '테스터 데이터 정리 실패');
      return reply.code(500).send({ error: error.message });
    }
    return { deleted: Number(data ?? 0) };
  });
}
