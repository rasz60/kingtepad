// 실제 pixel-agents(npx pixel-agents)를 자식 프로세스로 띄우고, 배치 작업 상태를
// pixel-agents 가 이해하는 "Claude Code 훅 이벤트"로 바꿔 내부 API(POST /api/hooks/claude)로 보낸다.
// pixel-agents 자체는 수정하지 않는다. 화면(픽셀 오피스)도 pixel-agents 가 직접 서빙한다.
//
// 참고(리버스 엔지니어링, 공식 API 아님):
// - 시작 시 ~/.pixel-agents/server.json 에 { port, pid, token } 을 쓴다.
// - POST http://127.0.0.1:{port}/api/hooks/claude (Authorization: Bearer {token}) 로 훅 payload 를 보내면 캐릭터가 갱신된다.
// - standalone 모드는 현재 폴더 세션만 추적하므로 ~/.pixel-agents/config.json 의
//   standalone.watchAllSessions 를 켜야 임의의 session_id 도 인식한다.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';

export interface AgentStatus {
  agentId: string;
  status: string;
  message: string;
  updatedAt: number;
}

export interface HookResult {
  ok: boolean;
  status?: number;
  error?: string;
}

const CONFIG_PATH = path.join(os.homedir(), '.pixel-agents', 'config.json');
const SERVER_JSON_PATH = path.join(os.homedir(), '.pixel-agents', 'server.json');
const BASH_COMMAND_MAX_LEN = 160;
const START_TIMEOUT_MS = 30_000;

const RUNNING = new Set(['RUNNING', 'WORKING', 'ACTIVE']);
const WAITING = new Set(['WAITING', 'PENDING', 'QUEUED']);
const ERROR = new Set(['ERROR', 'FAILED']);

let child: ChildProcess | null = null;
let serverPort: number | null = null;
let serverToken: string | null = null;
/** SessionStart 를 보낸 agentId */
const startedSessions = new Set<string>();

function readJson(file: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function ensureWatchAllSessions(log: FastifyBaseLogger) {
  const config = readJson(CONFIG_PATH) ?? {};
  config.standalone ??= {};
  if (config.standalone.watchAllSessions === true) return;
  config.standalone.watchAllSessions = true;
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    log.info('pixel-agents config.json: standalone.watchAllSessions -> true');
  } catch (e) {
    log.warn({ err: e }, 'pixel-agents config.json 갱신 실패');
  }
}

/** 비정상 종료로 남은 server.json 을 지운다. 그대로 두면 죽은 프로세스의 포트/토큰을 잘못 쓸 수 있다 */
function cleanupStaleServerJson() {
  const pid = readJson(SERVER_JSON_PATH)?.pid as number | undefined;
  if (!pid) return;
  try {
    process.kill(pid, 0);
  } catch {
    fs.rmSync(SERVER_JSON_PATH, { force: true });
  }
}

/** stdout 으로 포트가 확정된 뒤, server.json 이 그 포트로 갱신될 때까지 기다려 토큰을 읽는다 */
async function waitForToken(port: number, timeoutMs: number): Promise<string | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const config = readJson(SERVER_JSON_PATH);
    if (config?.port === port && config.token) return config.token as string;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/** pixel-agents 를 띄우고 내부 서버 포트를 돌려준다 */
export function startPixelAgents(projectDir: string, log: FastifyBaseLogger): Promise<number> {
  ensureWatchAllSessions(log);
  cleanupStaleServerJson();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, port?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(port!);
    };
    const timer = setTimeout(() => finish(new Error('pixel-agents 서버 준비 시간 초과 (30초)')), START_TIMEOUT_MS);

    const proc = spawn('npx', ['--yes', 'pixel-agents'], {
      cwd: projectDir,
      env: process.env,
      shell: process.platform === 'win32',
    });
    child = proc;

    let portDetected = false;
    proc.stdout?.on('data', async (buf: Buffer) => {
      const text = buf.toString();
      log.info(`[pixel-agents] ${text.trimEnd()}`);
      if (portDetected) return;
      // 버전·상황(새로 띄움/기존 서버 재사용)에 따라 "listening on 127.0.0.1:N" 또는 "server running at http://127.0.0.1:N"
      const match = text.match(/(?:listening (?:on|at)|running at) (?:http:\/\/)?127\.0\.0\.1:(\d+)/i);
      if (!match) return;
      portDetected = true;
      const port = Number(match[1]);
      const token = await waitForToken(port, 8_000);
      if (!token) return finish(new Error(`pixel-agents 가 포트 ${port} 로 떴지만 server.json 에서 토큰을 찾지 못했습니다.`));
      serverPort = port;
      serverToken = token;
      finish(null, port);
    });
    proc.stderr?.on('data', (buf: Buffer) => log.warn(`[pixel-agents] ${buf.toString().trimEnd()}`));
    proc.on('exit', (code) => {
      log.warn(`pixel-agents 프로세스 종료 (code=${code})`);
      if (child === proc) {
        child = null;
        serverPort = null;
        serverToken = null;
        startedSessions.clear();
      }
      if (!portDetected) finish(new Error(`pixel-agents 가 준비되기 전에 종료됨 (${code})`));
    });
    proc.on('error', (err) => finish(err));
  });
}

export function stopPixelAgents() {
  child?.kill();
  child = null;
}

export function isPixelAgentsReady(): boolean {
  return !!(serverPort && serverToken);
}

function sendHook(payload: Record<string, unknown>): Promise<HookResult> {
  return new Promise((resolve) => {
    if (!isPixelAgentsReady()) return resolve({ ok: false, error: 'pixel-agents 가 아직 준비되지 않았습니다.' });
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: serverPort!,
        path: '/api/hooks/claude',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${serverToken}`,
        },
        timeout: 2_000,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode }));
      },
    );
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.end(body);
  });
}

const truncate = (s: string) => (s.length > BASH_COMMAND_MAX_LEN ? `${s.slice(0, BASH_COMMAND_MAX_LEN)}…` : s);

/** 배치 작업 상태 하나를 pixel-agents 캐릭터 애니메이션으로 반영한다 */
export async function applyStatus(entry: AgentStatus, projectDir: string): Promise<HookResult> {
  if (!isPixelAgentsReady()) return { ok: false, error: 'pixel-agents 가 아직 준비되지 않았습니다.' };
  const session_id = entry.agentId;
  if (!startedSessions.has(session_id)) {
    startedSessions.add(session_id);
    await sendHook({ hook_event_name: 'SessionStart', session_id, cwd: projectDir, source: 'startup' });
  }

  const message = entry.message || entry.status;
  const bash = (command: string) => ({ hook_event_name: 'PreToolUse', session_id, tool_name: 'Bash', tool_input: { command } });

  if (WAITING.has(entry.status)) return sendHook({ hook_event_name: 'PermissionRequest', session_id });

  await sendHook({ hook_event_name: 'PostToolUse', session_id });
  if (RUNNING.has(entry.status)) return sendHook(bash(truncate(message)));
  if (ERROR.has(entry.status)) return sendHook(bash(truncate(`⚠ ERROR: ${message}`)));
  // DONE / IDLE / COMPLETE / 그 외: 하던 작업을 마무리하고 idle 로
  return sendHook({ hook_event_name: 'Stop', session_id });
}
