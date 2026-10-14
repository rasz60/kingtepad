import { ALARM_PRESETS, formatAlarm } from '@kingtepad/shared';
import { useState } from 'react';

const UNITS = [
  { value: 1440, label: '일' },
  { value: 60, label: '시간' },
  { value: 1, label: '분' },
];

/** 알람 선택: 프리셋(30분·1시간·1일 전) 토글 + 직접 입력(n일/시간/분 전) */
export function AlarmPicker({ value, onChange, hint }: { value: number[]; onChange: (v: number[]) => void; hint: string }) {
  const [amount, setAmount] = useState(2);
  const [unit, setUnit] = useState(1440);
  const set = (next: number[]) => onChange([...new Set(next)].sort((a, b) => a - b));
  const toggle = (m: number) => set(value.includes(m) ? value.filter((v) => v !== m) : [...value, m]);
  const custom = value.filter((m) => !ALARM_PRESETS.includes(m));

  return (
    <div className="alarm-picker">
      <span className="alarm-label">
        알람 <span className="comment">// {hint}</span>
      </span>
      <div className="alarm-row">
        {ALARM_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            className={`chip ${value.includes(m) ? 'on' : ''}`}
            aria-pressed={value.includes(m)}
            onClick={() => toggle(m)}
          >
            {formatAlarm(m)}
          </button>
        ))}
        {custom.map((m) => (
          <button key={m} type="button" className="chip on" onClick={() => toggle(m)} title="눌러서 삭제">
            {formatAlarm(m)} ×
          </button>
        ))}
      </div>
      <div className="alarm-row">
        <input
          type="number"
          min={1}
          max={99}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))}
          aria-label="알람 시간"
        />
        <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} aria-label="알람 단위">
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label} 전
            </option>
          ))}
        </select>
        <button type="button" className="btn-ghost" onClick={() => set([...value, amount * unit])}>
          추가
        </button>
      </div>
    </div>
  );
}
