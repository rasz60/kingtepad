import { useState, type FormEvent } from 'react';
import { Pixel } from '../components/Pixel';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError('로그인에 실패했어요. 이메일과 비밀번호를 확인해 주세요.');
    setBusy(false);
  }

  return (
    <div className="login">
      <div className="dialog login-dialog" role="dialog" aria-label="로그인">
        <header className="dialog-title">
          <Pixel name="floppy" scale={1.2} />
          <h2>업무일지++ 열기</h2>
        </header>
        <form className="dialog-body form" onSubmit={submit}>
          <div className="login-hello">
            <Pixel name="turtle" scale={4} />
            <p>
              오늘도 수고했어요!
              <br />
              <span className="comment">// 로그인하고 일지를 써 볼까요?</span>
            </p>
          </div>
          <label>
            이메일
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="btn-primary" disabled={busy}>
              {busy ? '여는 중…' : '열기(O)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
