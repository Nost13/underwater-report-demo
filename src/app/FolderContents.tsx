import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './Modal';
import { pickDirectory, type DirectoryHandleLike, type FileHandleLike } from '../browser/directory';

export function FolderContents({ root, onClose }: { root: DirectoryHandleLike; onClose: () => void }) {
  const [path, setPath] = useState([root]);
  const [entries, setEntries] = useState<Array<DirectoryHandleLike | FileHandleLike>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const current = path[path.length - 1];
  const navigate=(next:DirectoryHandleLike[])=>{setLoading(true);setEntries([]);setError('');setPath(next);};
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const next: typeof entries = [];
        for await (const [, entry] of current.entries()) { next.push(entry); if (next.length >= 5000) break; }
        if (active) setEntries(next.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
      } catch { if (active) setError('폴더를 읽지 못했습니다. 원본 폴더가 연결되어 있는지 확인해주세요.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [current]);
  return createPortal(<Modal label="생성한 폴더 확인" onClose={onClose}><section className="folder-browser">
    <h2>생성한 폴더 확인</h2><p>{path.map((entry) => entry.name).join(' > ')}</p>
    <div className="editor-dialog-actions"><button type="button" disabled={path.length === 1} onClick={() => navigate(path.slice(0, -1))}>상위 폴더</button>
      <button type="button" onClick={async () => { try { await pickDirectory('read', current); } catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('이 브라우저에서는 폴더 선택창을 열 수 없습니다. 아래 목록에서 확인해주세요.'); } }}>이 위치에서 폴더 선택창 열기</button><button type="button" onClick={onClose}>닫기</button></div>
    <p className="muted">웹에서 폴더 내용을 확인합니다. 폴더 선택창은 지원되는 브라우저에서만 열립니다.</p>
    {loading && <p role="status">폴더를 읽는 중…</p>}{error && <p role="alert">{error}</p>}
    <ul className="folder-entries">{entries.map((entry) => <li key={entry.name}>{entry.kind === 'directory' ? <button type="button" aria-label={`${entry.name} 폴더 열기`} onClick={() => navigate([...path, entry])}>▸ {entry.name}</button> : <span>{entry.name}</span>}</li>)}</ul>
    {!loading && !error && entries.length === 0 && <p>빈 폴더입니다.</p>}
  </section></Modal>, document.body);
}
