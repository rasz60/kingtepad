// 에이전트 모니터 (구 pixel-agent-monitor 통합)
//   POST /monitor/status   배치 작업이 상태를 보낸다 → 픽셀 오피스 캐릭터 + 실시간 로그 + (실패·완료면) 알림/웹 푸시
//   POST /monitor/session  Supabase 로그인 확인 후 세션 쿠키 발급 (오피스 iframe·WebSocket 용)
//   GET  /monitor/ws       실시간 로그 (세션 쿠키)
//   픽셀 오피스 화면은 별도 포트의 프록시(officeProxy)로 연다.
import crypto from 'node:crypto';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { Notifier } from '../notifier';
import { requireUser } from '../supabase';
import { startOfficeProxy } from './officeProxy';
import { applyStatus, idleLabel, isPixelAgentsReady, officeName, startPixelAgents, stopPixelAgents, type AgentStatus } from './pixelAgents';
import { sessionCookie, sessionUser } from './session';
import { createStateSaver, loadState } from './state';

/** 알림함·웹 푸시로 알리는 상태. ERROR/FAILED = 실패, COMPLETE = 놓치면 안 되는 완료 (예: 개찰결과 공개) */
const ALERT_STATUSES = new Set(['ERROR', 'FAILED', 'COMPLETE']);
const RECENT_MAX = 50;
const NAME_MAX = 40;
const LABEL_MAX = 60;

/** 선택 문자열 필드: 비었으면 undefined, 길면 자른다 */
const optionalText = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) || undefined : undefined);

const PROJECT_DIR = process.env.PIXEL_AGENTS_PROJECT_DIR || process.cwd();
const OFFICE_PORT = Number(process.env.MONITOR_OFFICE_PORT ?? 8081);
const INGEST_TOKEN = process.env.MONITOR_INGEST_TOKEN ?? '';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * 상태 수신 권한. 토큰을 설정했으면 X-Monitor-Token 헤더로 확인하고,
 * 없으면 같은 서버의 배치 작업만 받는다 (Caddy 를 거친 외부 요청은 X-Forwarded-For 가 붙는다).
 */
function canIngest(req: FastifyRequest): boolean {
  if (INGEST_TOKEN) {
    const a = Buffer.from(String(req.headers['x-monitor-token'] ?? ''));
    const b = Buffer.from(INGEST_TOKEN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return !req.headers['x-forwarded-for'] && LOOPBACK.has(req.socket.remoteAddress ?? '');
}

const isHttps = (req: FastifyRequest) => req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

export async function monitorRoutes(app: FastifyInstance, opts: { notifier: Notifier | null }) {
  await app.register(websocket);

  // 재시작 전 상태를 이어받는다 (장 마감 후 재배포돼도 로그·캐릭터가 남게)
  const saved = loadState();
  const agents = new Map<string, AgentStatus>(saved.agents.map((a) => [a.agentId, a]));
  const recent: AgentStatus[] = saved.recent.slice(0, RECENT_MAX);
  const clients = new Set<WebSocket>();
  const saveState = createStateSaver(
    () => ({ agents: [...agents.values()], recent }),
    (err) => app.log.warn({ err }, '에이전트 모니터 상태 저장 실패'),
  );

  const broadcast = (payload: unknown) => {
    const data = JSON.stringify(payload);
    for (const c of clients) if (c.readyState === c.OPEN) c.send(data);
  };

  app.post<{
    Body: {
      agentId?: unknown;
      status?: unknown;
      message?: unknown;
      name?: unknown;
      label?: unknown;
    };
  }>('/monitor/status', async (req, reply) => {
    if (!canIngest(req)) return reply.code(403).send({ ok: false, error: 'forbidden' });
    const { agentId, status, message, name, label } = req.body ?? {};
    if (!agentId || !status) return reply.code(400).send({ ok: false, error: 'agentId, status 필드는 필수입니다.' });

    const entry: AgentStatus = {
      agentId: String(agentId),
      status: String(status).toUpperCase(),
      message: message ? String(message) : '',
      updatedAt: Date.now(),
      name: optionalText(name, NAME_MAX),
      label: optionalText(label, LABEL_MAX),
    };
    agents.set(entry.agentId, entry);
    recent.unshift(entry);
    recent.length = Math.min(recent.length, RECENT_MAX);
    saveState();
    broadcast({ type: 'agentUpdate', agent: entry });

    if (ALERT_STATUSES.has(entry.status) && opts.notifier) {
      opts.notifier
        .notifyOwners({
          kind: 'agent',
          title: `${entry.status === 'COMPLETE' ? '✅' : '🚨'} ${entry.agentId}`,
          body: entry.message,
          link: '/monitor',
          dedupe_key: `agent:${entry.agentId}:${entry.status}:${entry.updatedAt}`,
          fire_at: new Date(entry.updatedAt).toISOString(),
        })
        .catch((e) => req.log.error({ err: e }, '에이전트 알림 저장 실패'));
    }

    const pixelAgents = await applyStatus(entry);
    return { ok: true, agent: entry, delivered: clients.size, pixelAgents };
  });

  app.post('/monitor/session', { preHandler: requireUser }, async (req, reply) => {
    reply.header('set-cookie', sessionCookie(req.userId, isHttps(req)));
    return { ok: true, pixelAgentsReady: isPixelAgentsReady() };
  });

  app.delete('/monitor/session', async (req, reply) => {
    reply.header('set-cookie', sessionCookie(null, isHttps(req)));
    return { ok: true };
  });

  app.get(
    '/monitor/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        if (!sessionUser(req.raw)) await reply.code(401).send({ error: 'unauthorized' });
      },
    },
    (socket) => {
      clients.add(socket);
      socket.send(JSON.stringify({ type: 'snapshot', recent, agents: [...agents.values()], pixelAgentsReady: isPixelAgentsReady() }));
      socket.on('close', () => clients.delete(socket));
      socket.on('error', () => clients.delete(socket));
    },
  );

  // pixel-agents + 오피스 프록시. MONITOR_PIXEL_AGENTS=0 이면 끈다 (로그·알림은 계속 동작)
  if (process.env.MONITOR_PIXEL_AGENTS === '0') {
    app.log.info('MONITOR_PIXEL_AGENTS=0: 픽셀 오피스를 띄우지 않습니다.');
    return;
  }
  let proxy: ReturnType<typeof startOfficeProxy> | null = null;
  // 쉬는 캐릭터 라벨 문구 (오피스 화면이 15초마다 가져간다)
  const officeLabels = () => {
    const out: Record<string, string> = {};
    for (const a of agents.values()) {
      const label = idleLabel(a);
      if (label) out[officeName(a)] = label;
    }
    return out;
  };
  // 새로 뜬 pixel-agents 는 빈 사무실이라, 에이전트마다 마지막 상태를 다시 보내 캐릭터를 되살린다.
  // (상태 전송이 pixel-agents 준비 전에 와서 버려진 경우도 여기서 채워진다)
  const restoreOffice = async () => {
    for (const a of agents.values()) await applyStatus(a);
    if (agents.size > 0) app.log.info(`픽셀 오피스: 에이전트 ${agents.size}명 복원`);
  };
  // 첫 실행은 npx 다운로드로 오래 걸리므로 API 시작을 막지 않고 뒤에서 띄운다
  app.addHook('onReady', async () => {
    startPixelAgents(PROJECT_DIR, app.log)
      .then((port) => {
        proxy = startOfficeProxy(OFFICE_PORT, process.env.HOST ?? '0.0.0.0', port, app.log, officeLabels);
        broadcast({ type: 'pixelAgentsReady' });
        return restoreOffice();
      })
      .catch((e) => app.log.error({ err: e }, "pixel-agents 시작 실패 ('npx pixel-agents' 가 동작하는지 확인)"));
  });
  app.addHook('onClose', async () => {
    proxy?.close();
    stopPixelAgents();
  });
}
