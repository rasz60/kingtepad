// 에이전트 모니터 상태를 파일에 남긴다. API 가 재시작(자동 배포 등)되면 pixel-agents 도 빈 사무실로 새로 뜨는데,
// 장 마감 후처럼 잡이 더 이상 상태를 보내지 않으면 캐릭터가 다음 이벤트까지 사라진다.
// 그래서 에이전트별 마지막 상태와 최근 로그를 저장해 두고, 시작할 때 읽어 사무실과 로그를 복원한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentStatus } from './pixelAgents';

export interface MonitorState {
  agents: AgentStatus[];
  recent: AgentStatus[];
}

/** 이보다 오래 소식이 없는 에이전트는 복원하지 않는다 (지운 잡이 계속 남지 않게) */
const RESTORE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 1_000;

export const STATE_FILE = process.env.MONITOR_STATE_FILE || path.join(os.homedir(), '.kingtepad', 'monitor-state.json');

export function loadState(): MonitorState {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as Partial<MonitorState>;
    const since = Date.now() - RESTORE_MAX_AGE_MS;
    return {
      agents: (data.agents ?? []).filter((a) => a.updatedAt >= since),
      recent: data.recent ?? [],
    };
  } catch {
    return { agents: [], recent: [] };
  }
}

/** 상태가 바뀔 때마다 부른다. 몰아서 1초 뒤 한 번 쓴다 */
export function createStateSaver(read: () => MonitorState, onError: (err: unknown) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
        // 쓰다가 죽어도 파일이 깨지지 않게 임시 파일에 쓴 뒤 바꿔치기
        fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(read()));
        fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
      } catch (err) {
        onError(err);
      }
    }, SAVE_DEBOUNCE_MS);
  };
}
