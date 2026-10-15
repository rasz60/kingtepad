// pixel-agents 는 127.0.0.1 에만 바인딩되므로, 별도 포트에서 세션 쿠키로 보호하는 리버스 프록시를 띄운다 (HTTP + WebSocket).
// pixel-agents 화면은 루트 경로(/) 기준이라 API 경로 아래로 넣지 않고 포트를 따로 쓴다.
// WebSocket 업그레이드는 요청마다 인증을 확인한 뒤 직접 upgrade() 를 부른다
// (자동 ws:true 처리는 첫 인증 이후의 업그레이드를 검사 없이 통과시키기 때문).
import http from 'node:http';
import type { FastifyBaseLogger } from 'fastify';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { injectOfficeScripts } from './officeScripts';
import { sessionUser } from './session';

const DENIED = '업무일지++ 의 에이전트.exe 탭에서 열어 주세요.';

/** 다른 사이트가 세션 쿠키로 WebSocket 을 여는 것(CSWSH)을 막는다. 오피스 화면 자신이 연 연결만 통과 */
function isSameOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // 브라우저가 아닌 클라이언트
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function serveIndex(targetPort: number, url: string, res: http.ServerResponse) {
  const upstream = await fetch(`http://127.0.0.1:${targetPort}${url}`);
  const html = await upstream.text();
  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') ?? 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache', // 내용을 바꿔 보내므로 원본 ETag/Last-Modified 는 쓰지 않는다
  });
  res.end(upstream.ok ? injectOfficeScripts(html) : html);
}

/** 쉬는 캐릭터 라벨: 오피스 이름 → 문구 (예: { 삼성전자: '퇴근했습니다!😁' }) */
export type OfficeLabels = () => Record<string, string>;

export function startOfficeProxy(listenPort: number, host: string, targetPort: number, log: FastifyBaseLogger, labels: OfficeLabels) {
  const proxy = createProxyMiddleware({ target: `http://127.0.0.1:${targetPort}`, changeOrigin: true });

  const server = http.createServer((req, res) => {
    if (!sessionUser(req)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(DENIED);
    }
    const path = req.url?.split('?')[0];
    if (req.method === 'GET' && path === '/__kt/labels') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(JSON.stringify(labels()));
    }
    // 화면 HTML 에만 터치·라벨 스크립트를 넣는다. 나머지(에셋·API)는 그대로 중계
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      serveIndex(targetPort, req.url!, res).catch((err) => {
        log.warn({ err }, '픽셀 오피스 index.html 중계 실패');
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      return;
    }
    proxy(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });

  server.on('upgrade', (req, socket, head) => {
    // 처리 안 된 소켓 오류는 API 프로세스 전체를 죽이므로 반드시 받아 둔다 (브라우저 탭을 닫으면 ECONNRESET 이 흔하다)
    socket.on('error', (err) => log.debug({ err }, '오피스 프록시 WebSocket 소켓 오류'));
    if (!sessionUser(req) || !isSameOrigin(req)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    // pixel-agents 는 Origin 이 자기 주소가 아니면 WebSocket 을 4003(forbidden origin)으로 끊는다.
    // 출처 검사는 위에서 했으므로 대상 주소로 바꿔 넘긴다.
    req.headers.origin = `http://127.0.0.1:${targetPort}`;
    proxy.upgrade(req, socket as import('node:net').Socket, head);
  });

  server.listen(listenPort, host, () => log.info(`픽셀 오피스 프록시: http://${host}:${listenPort} -> 127.0.0.1:${targetPort}`));
  return server;
}
