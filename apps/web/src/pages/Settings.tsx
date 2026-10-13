import type { Category } from '@kingtepad/shared';
import { useState } from 'react';
import { useApp } from '../lib/AppContext';
import { deleteCategory, saveCategory } from '../lib/db';
import { supabase } from '../lib/supabase';

export function Settings() {
  const { session, categories, reloadCategories } = useApp();
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
    <div className="page">
      <header className="page-header">
        <h1>설정</h1>
      </header>

      <section>
        <h2 className="section-title">카테고리</h2>
        <ul className="card category-list">
          {categories.map((c, i) => (
            <li key={c.id}>
              <input
                type="color"
                value={c.color}
                onChange={(e) => run(() => saveCategory({ ...c, color: e.target.value }))}
                aria-label={`${c.name} 색상`}
              />
              <span className="grow">{c.name}</span>
              <button className="link-btn" disabled={i === 0} onClick={() => move(c, -1)} aria-label="위로">
                ▲
              </button>
              <button className="link-btn" disabled={i === categories.length - 1} onClick={() => move(c, 1)} aria-label="아래로">
                ▼
              </button>
              <button
                className="link-btn danger"
                onClick={() => window.confirm(`'${c.name}' 카테고리를 삭제할까요? 해당 업무는 미분류가 됩니다.`) && run(() => deleteCategory(c.id))}
              >
                삭제
              </button>
            </li>
          ))}
          <li>
            <input
              className="grow"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder="새 카테고리"
            />
            <button className="btn-primary" onClick={add}>
              추가
            </button>
          </li>
        </ul>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h2 className="section-title">계정</h2>
        <div className="card account">
          <span>{session?.user.email}</span>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>
            로그아웃
          </button>
        </div>
      </section>
    </div>
  );
}
