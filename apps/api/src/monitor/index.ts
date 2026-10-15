// 에이전트 모니터 (구 pixel-agent-monitor 통합)
//   POST /monitor/status   배치 작업이 상태를 보낸다 → 픽셀 오피스 캐릭터 + 실시간 로그 + (실패·완료면) 알림/웹 푸시
//   POST /monitor/session  Supabase 로그인 확인 후 세션 쿠키 발급 (오피스 iframe·WebSocket 용)
//   GET  /monitor/ws       실시간 로그 (세션 쿠키)
//   GET  /monitor/token    내 잡 토큰 (Supabase 로그인)
//   픽셀 오피스 화면은 별도 포트의 프록시(officeProxy)로 연다.
//
// 계정별 분리: 로그와 알림은 잡을 등록한 계정에만 간다. 픽셀 오피스는 모두가 같이 본다.
//   - 계정 잡 토큰(kt1.…)으로 보낸 상태 → 그 계정
//   - 공용 토큰(MONITOR_INGEST_TOKEN) 또는 같은 서버에서 토큰 없이 보낸 상태 → 기본 소유자
//     (MONITOR_OWNER_USER_ID, 없으면 가장 먼저 가입한 계정. 그것도 모르면 모두에게 보임)
import crypto from 'node:crypto';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import type { Notifier } from '../notifier';
import { requireUser } from '../supabase';
import { createIngestToken, isIngestToken, verifyIngestToken } from './ingestToken';
import { startOfficeProxy } from './officeProxy';
import { applyStatus, idleLabel, isPixelAgentsReady, officeName, startPixelAgents, stopPixelAgents, type AgentStatus } from './pixelAgents';
import { sessionCookie, sessionUser } from './session';
import { createStateSaver, loadState } from './state';

/** 알림함·웹 푸시로 알리는 상태. ERROR/FAILED = 실패, COMPLETE = 놓치면 안 되는 완료 (예: 개찰결과 공개) */
const ALERT_STATUSES = new Set(['ERROR', 'FAILED', 'COMPLETE']);
/** 계정마다 보여 주는 최근 로그 수 */
const RECENT_MAX = 50;
/** 서버가 들고 있는 최근 로그 전체 (계정 여럿 몫) */
const RECENT_KEEP = 300;
const NAME_MAX = 40;
const LABEL_MAX = 60;

/** 선택 문자열 필드: 비었으면 undefined, 길면 자른다 */
const optionalText = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) || undefined : undefined);

const PROJECT_DIR = process.env.PIXEL_AGENTS_PROJECT_DIR || process.cwd();
const OFFICE_PORT = Number(process.env.MONITOR_OFFICE_PORT ?? 8081);
const INGEST_TOKEN = process.env.MONITOR_INGEST_TOKEN ?? '';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * 상태를 보낸 쪽 확인. 계정 토큰이면 { owner: 그 계정 }, 공용 토큰·같은 서버면 { owner: 'default' }, 아니면 null(거부).
 * 공용 토큰을 설정했으면 같은 서버라도 토큰이 있어야 한다 (Caddy 를 거친 외부 요청은 X-Forwarded-For 가 붙는다).
 */
function identifySender(req: FastifyRequest): { owner: string } | null {
  const token = String(req.headers['x-monitor-token'] ?? '');
  if (token && isIngestToken(token)) {
    const userId = verifyIngestToken(token);
    return userId ? { owner: userId } : null;
  }
  if (INGEST_TOKEN) return sameText(token, INGEST_TOKEN) ? { owner: 'default' } : null;
  return !req.headers['x-forwarded-for'] && LOOPBACK.has(req.socket.remoteAddress ?? '') ? { owner: 'default' } : null;
}

const isHttps = (req: FastifyRequest) => req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';

/** 그 계정이 볼 수 있는 상태 (주인 없는 예전 상태는 모두에게 보인다) */
const visibleTo = (userId: string) => (a: AgentStatus) => !a.ownerId || a.ownerId === userId;
const agentKey = (a: AgentStatus) => `${a.ownerId ?? '-'}:${a.agentId}`;

export async function monitorRoutes(app: FastifyInstance, opts: { notifier: Notifier | null }) {
  await app.register(websocket);

  /** 공용 토큰·같은 서버에서 온 잡의 주인 */
  async function defaultOwner(): Promise<string | undefined> {
    if (process.env.MONITOR_OWNER_USER_ID) return process.env.MONITOR_OWNER_USER_ID;
    try {
      return (await opts.notifier?.firstUserId()) ?? undefined;
    } catch (err) {
      app.log.warn({ err }, '에이전트 기본 소유자 조회 실패 (모두에게 보이게 둔다)');
      return undefined;
    }
  }

  // 재시작 전 상태를 이어받는다 (장 마감 후 재배포돼도 로그·캐릭터가 남게)
  const saved = loadState();
  const agents = new Map<string, AgentStatus>(saved.agents.map((a) => [agentKey(a), a]));
  const recent: AgentStatus[] = saved.recent.slice(0, RECENT_KEEP);
  const clients = new Map<WebSocket, string>(); // 소켓 → 계정
  const saveState = createStateSaver(
    () => ({ agents: [...agents.values()], recent }),
    (err) => app.log.warn({ err }, '에이전트 모니터 상태 저장 실패'),
  );

  /** 계정 구분 전에 저장된 상태(주인 없음)를 기본 소유자 것으로 옮긴다. 캐릭터 복원 전에 한 번 */
  async function adoptLegacyState() {
    const owner = await defaultOwner();
    if (!owner) return;
    let moved = 0;
    for (const [key, a] of [...agents]) {
      if (a.ownerId) continue;
      agents.delete(key);
      a.ownerId = owner;
      agents.set(agentKey(a), a);
      moved++;
    }
    for (const a of recent) a.ownerId ??= owner;
    if (moved > 0) {
      app.log.info(`에이전트 모니터: 예전 상태 ${moved}건을 기본 소유자 것으로 옮김`);
      saveState();
    }
  }
  const legacyAdopted = adoptLegacyState();

  const send = (socket: WebSocket, payload: unknown) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(payload));
  /** 상태 하나를 볼 수 있는 계정의 소켓에만 보낸다 */
  const broadcastAgent = (agent: AgentStatus) => {
    for (const [socket, userId] of clients) if (visibleTo(userId)(agent)) send(socket, { type: 'agentUpdate', agent });
  };
  const broadcastAll = (payload: unknown) => {
    for (const socket of clients.keys()) send(socket, payload);
  };

  app.post<{ Body: { agentId?: unknown; status?: unknown; message?: unknown; name?: unknown; label?: unknown } }>(
    '/monitor/status',
    async (req, reply) => {
      const sender = identifySender(req);
      if (!sender) return reply.code(403).send({ ok: false, error: 'forbidden' });
      const { agentId, status, message, name, label } = req.body ?? {};
      if (!agentId || !status) return reply.code(400).send({ ok: false, error: 'agentId, status 필드는 필수입니다.' });

      await legacyAdopted;
      const entry: AgentStatus = {
        agentId: String(agentId),
        status: String(status).toUpperCase(),
        message: message ? String(message) : '',
        updatedAt: Date.now(),
        name: optionalText(name, NAME_MAX),
        label: optionalText(label, LABEL_MAX),
        ownerId: sender.owner === 'default' ? await defaultOwner() : sender.owner,
      };
      agents.set(agentKey(entry), entry);
      recent.unshift(entry);
      recent.length = Math.min(recent.length, RECENT_KEEP);
      saveState();
      broadcastAgent(entry);

      if (ALERT_STATUSES.has(entry.status) && opts.notifier) {
        const draft = {
          kind: 'agent' as const,
          title: `${entry.status === 'COMPLETE' ? '✅' : '🚨'} ${entry.name ?? entry.agentId}`,
          body: entry.message,
          link: '/monitor',
          dedupe_key: `agent:${entry.agentId}:${entry.status}:${entry.updatedAt}`,
          fire_at: new Date(entry.updatedAt).toISOString(),
        };
        (entry.ownerId ? opts.notifier.notifyUser(entry.ownerId, draft) : opts.notifier.notifyOwners(draft)).catch((e) =>
          req.log.error({ err: e }, '에이전트 알림 저장 실패'),
        );
      }

      const pixelAgents = await applyStatus(entry);
      return { ok: true, agent: entry, pixelAgents };
    },
  );

  app.post('/monitor/session', { preHandler: requireUser }, async (req, reply) => {
    reply.header('set-cookie', sessionCookie(req.userId, isHttps(req)));
    return { ok: true, pixelAgentsReady: isPixelAgentsReady() };
  });

  app.delete('/monitor/session', async (req, reply) => {
    reply.header('set-cookie', sessionCookie(null, isHttps(req)));
    return { ok: true };
  });

  // 내 잡 토큰. 잡의 jobs/.env MONITOR_INGEST_TOKEN 에 넣으면 그 잡의 로그·알림이 내 계정으로 온다
  app.get('/monitor/token', { preHandler: requireUser }, async (req) => ({ token: createIngestToken(req.userId) }));

  app.get(
    '/monitor/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        if (!sessionUser(req.raw)) await reply.code(401).send({ error: 'unauthorized' });
      },
    },
    async (socket, req) => {
      const userId = sessionUser(req.raw)!;
      clients.set(socket, userId);
      socket.on('close', () => clients.delete(socket));
      socket.on('error', () => clients.delete(socket));
      await legacyAdopted;
      const mine = visibleTo(userId);
      send(socket, {
        type: 'snapshot',
        recent: recent.filter(mine).slice(0, RECENT_MAX),
        agents: [...agents.values()].filter(mine),
        pixelAgentsReady: isPixelAgentsReady(),
      });
    },
  );

  // pixel-agents + 오피스 프록시. MONITOR_PIXEL_AGENTS=0 이면 끈다 (로그·알림은 계속 동작)
  if (process.env.MONITOR_PIXEL_AGENTS === '0') {
    app.log.info('MONITOR_PIXEL_AGENTS=0: 픽셀 오피스를 띄우지 않습니다.');
    return;
  }
  let proxy: ReturnType<typeof startOfficeProxy> | null = null;
  // 쉬는 캐릭터 라벨 문구 (오피스 화면이 15초마다 가져간다). 오피스는 공용이라 모든 계정 것을 준다
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
    await legacyAdopted;
    for (const a of agents.values()) await applyStatus(a);
    if (agents.size > 0) app.log.info(`픽셀 오피스: 에이전트 ${agents.size}명 복원`);
  };
  // 첫 실행은 npx 다운로드로 오래 걸리므로 API 시작을 막지 않고 뒤에서 띄운다
  app.addHook('onReady', async () => {
    startPixelAgents(PROJECT_DIR, app.log)
      .then((port) => {
        proxy = startOfficeProxy(OFFICE_PORT, process.env.HOST ?? '0.0.0.0', port, app.log, officeLabels);
        broadcastAll({ type: 'pixelAgentsReady' });
        return restoreOffice();
      })
      .catch((e) => app.log.error({ err: e }, "pixel-agents 시작 실패 ('npx pixel-agents' 가 동작하는지 확인)"));
  });
  app.addHook('onClose', async () => {
    proxy?.close();
    stopPixelAgents();
  });
}
