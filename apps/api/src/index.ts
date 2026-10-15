import cors from '@fastify/cors';
import Fastify from 'fastify';
import { monitorRoutes } from './monitor';
import { startNotifier } from './notifier';
import { reportRoutes } from './routes/reports';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  // 에이전트 모니터 세션 쿠키 (개발 중 웹과 API 의 포트가 다를 때)
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'DELETE'],
});

app.get('/health', async () => ({ ok: true }));
const notifier = startNotifier(app.log);
await app.register(reportRoutes);
await app.register(monitorRoutes, { notifier });

// TODO(3단계): 퇴근 전 일지 리마인더, 월간 보고서, AI 요약

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

// pm2 재시작·종료 때 pixel-agents 자식 프로세스도 같이 정리
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    setTimeout(() => process.exit(0), 1_500).unref();
    app.close().finally(() => process.exit(0));
  });
}
