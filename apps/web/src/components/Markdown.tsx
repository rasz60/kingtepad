import { useState } from 'react';
import { renderMarkdown } from '../lib/markdown';

export function Markdown({ source, empty = '내용이 없습니다.' }: { source: string; empty?: string }) {
  if (!source.trim()) return <p className="muted">{empty}</p>;
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = '마크다운으로 작성하세요.',
  rows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="md-editor">
      <div className="md-tabs">
        <button type="button" className={!preview ? 'active' : ''} onClick={() => setPreview(false)}>
          작성
        </button>
        <button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(true)}>
          미리보기
        </button>
      </div>
      {preview ? (
        <div className="md-preview">
          <Markdown source={value} />
        </div>
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} />
      )}
    </div>
  );
}
