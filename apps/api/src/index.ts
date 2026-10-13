import cors from '@fastify/cors';
import Fastify from 'fastify';
import { reportRoutes } from './routes/reports';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: (process.env.CORS_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean),
});

app.get('/health', async () => ({ ok: true }));
await app.register(reportRoutes);

// TODO(3단계): 퇴근 전 일지 리마인더 · 마감 임박 알림 (Web Push), 월간 보고서, AI 요약

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
