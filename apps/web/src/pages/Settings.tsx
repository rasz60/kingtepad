import type { Category } from '@kingtepad/shared';
import { useState } from 'react';
import { AGENT_STATUS_URL, AgentTokenSetting } from '../components/AgentToken';
import { useApp } from '../lib/AppContext';
import { deleteCategory, saveCategory } from '../lib/db';

/** .ini 파일처럼 보이는 설정 */
export function Settings() {
  const { categories, reloadCategories } = useApp();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setError('');
    try {
      await fn();
      await reloadCategories();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const add = () =>
    newName.trim() &&
    run(async () => {
      await saveCategory({ name: newName.trim(), sort_order: categories.length + 1 });
      setNewName('');
    });

  const move = (c: Category, dir: -1 | 1) => {
    const idx = categories.indexOf(c);
    const other = categories[idx + dir];
    if (!other) return;
    run(async () => {
      await saveCategory({ ...c, sort_order: other.sort_order });
      await saveCategory({ ...other, sort_order: c.sort_order });
    });
  };

  return (
    <div className="doc">
      <p className="ln comment">; 업무일지++ 설정 파일</p>
      <p className="ln comment">; 색상을 누르면 바꿀 수 있어요</p>
      <p className="ln">&nbsp;</p>
      <p className="ln ini-section">[카테고리]</p>
      {categories.map((c, i) => (
        <div key={c.id} className="ln ini-row">
          <span className="type ini-key">{c.name}</span>
          <span className="op">=</span>
          <label className="ini-color">
            <input
              type="color"
              value={c.color}
              onChange={(e) => run(() => saveCategory({ ...c, color: e.target.value }))}
              aria-label={`${c.name} 색상`}
            />
            <span className="num">{c.color}</span>
          </label>
          <span className="ini-actions">
            <button className="link-btn" disabled={i === 0} onClick={() => move(c, -1)} aria-label="위로">
              ▲
            </button>
            <button className="link-btn" disabled={i === categories.length - 1} onClick={() => move(c, 1)} aria-label="아래로">
              ▼
            </button>
            <button
              className="link-btn danger"
              onClick={() =>
                window.confirm(`'${c.name}' 카테고리를 삭제할까요? 해당 업무는 미분류가 돼요.`) && run(() => deleteCategory(c.id))
              }
            >
              삭제
            </button>
          </span>
        </div>
      ))}
      <div className="ln ini-row">
        <input
          className="ini-new"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="새 카테고리 이름"
        />
        <button className="btn-primary" onClick={add}>
          추가
        </button>
      </div>
      {error && <p className="ln error">{error}</p>}

      <p className="ln">&nbsp;</p>
      <p className="ln ini-section">[에이전트]</p>
      <p className="ln comment">; 배치 잡의 jobs/.env 에 아래 두 값을 넣으면 그 잡의 로그·알림이 이 계정으로 와요</p>
      <p className="ln comment">; (토큰은 비밀번호처럼 다뤄 주세요. 픽셀 오피스는 모든 계정이 같이 봐요)</p>
      <div className="ln ini-row">
        <span className="type ini-key">MONITOR_STATUS_URL</span>
        <span className="op">=</span>
        <span className="str agent-url">{AGENT_STATUS_URL}</span>
      </div>
      <div className="ln ini-row">
        <span className="type ini-key">MONITOR_INGEST_TOKEN</span>
        <span className="op">=</span>
        <AgentTokenSetting />
      </div>

      <p className="ln">&nbsp;</p>
      <p className="ln comment">; 계정 · 비밀번호 · 푸시 알림 · 앱 설치는 ae:p 홈의 계정 메뉴에서</p>
    </div>
  );
}
