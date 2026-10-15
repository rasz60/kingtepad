import { useState } from 'react';
import { API_URL, apiFetch } from '../lib/api';

/** 상태를 보낼 주소 (배포: https://…/api/monitor/status) */
export const AGENT_STATUS_URL = new URL(`${API_URL}/monitor/status`, location.href).href;

/** 설정.ini [에이전트]: 내 잡 토큰. 잡의 jobs/.env 에 넣으면 그 잡의 로그·알림이 내 계정으로 온다 */
export function AgentTokenSetting() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!API_URL) return <span className="comment">// API 서버가 설정되지 않았어요</span>;

  async function load() {
    setError('');
    try {
      const res = (await (await apiFetch('/monitor/token')).json()) as { token: string };
      setToken(res.token);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('복사하지 못했어요. 직접 선택해서 복사해 주세요.');
    }
  }

  if (!token)
    return (
      <>
        <button className="btn-ghost" onClick={load}>
          토큰 보기
        </button>
        {error && <span className="error">{error}</span>}
      </>
    );

  return (
    <>
      <input className="agent-token num" readOnly value={token} onFocus={(e) => e.target.select()} aria-label="잡 토큰" />
      <button className="btn-ghost" onClick={copy}>
        {copied ? '복사됨' : '복사'}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}
