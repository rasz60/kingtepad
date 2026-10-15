// 계정별 잡 토큰. 배치 작업이 X-Monitor-Token 헤더로 보내면 어느 계정의 잡인지 알 수 있다.
// 토큰 = kt1.<사용자 id>.<서명>. DB 에 저장하지 않고 서명만 확인한다 (서명 키를 바꾸면 모든 토큰이 폐기된다).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX = 'kt1';
const SECRET_FILE = path.join(os.homedir(), '.kingtepad', 'monitor-token-secret');

/** env 에 없으면 서버 파일에 한 번 만들어 계속 쓴다 (재시작해도 토큰이 유지되게) */
function loadSecret(): string {
  if (process.env.MONITOR_TOKEN_SECRET) return process.env.MONITOR_TOKEN_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}

const secret = loadSecret();
const sign = (userId: string) => crypto.createHmac('sha256', secret).update(`${PREFIX}.${userId}`).digest('base64url');

export function createIngestToken(userId: string): string {
  return `${PREFIX}.${userId}.${sign(userId)}`;
}

export const isIngestToken = (token: string) => token.startsWith(`${PREFIX}.`);

/** 토큰의 사용자 id. 위조됐거나 형식이 다르면 null */
export function verifyIngestToken(token: string): string | null {
  const [prefix, userId, sig] = token.split('.');
  if (prefix !== PREFIX || !userId || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(userId));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? userId : null;
}
