import { useEffect, useRef, useState } from 'react';
import { getDraft, listDrafts, saveDraft, type DraftHeader } from '../persistence/draftStore';
import { packArchive, unpackArchive } from '../persistence/archive';
import { snapshotFingerprint, navigationFingerprint } from '../persistence/fingerprint';
import { Modal } from './Modal';
import {usePendingContext} from './pendingEdits';

export function downloadLocalBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DraftToolbar({ snapshot, title, hasWork, onRestore, onNew }: {
  snapshot: unknown; title: string; hasWork: boolean; onRestore: (value: unknown) => void; onNew: () => void;
}) {
  const pending=usePendingContext();
  const [headers, setHeaders] = useState<DraftHeader[]>([]);
  const [chooser, setChooser] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  const fingerprint = snapshotFingerprint(snapshot);
  const navigation = navigationFingerprint(snapshot);
  const current = useRef({ snapshot, title, hasWork, fingerprint, navigation });
  const job = useRef({ id: crypto.randomUUID(), revision: 0 });
  const saving = useRef<Promise<unknown> | null>(null);
  const lastSaved = useRef<string | null>(null);
  const lastNavigation = useRef<string | null>(null);
  const initialized = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { current.current = { snapshot, title, hasWork, fingerprint, navigation }; }, [snapshot, title, hasWork, fingerprint, navigation]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void listDrafts().then((values) => { setHeaders(values); setChooser(values.length > 0); setReady(values.length === 0); })
      .catch((reason) => { setError(String(reason?.message ?? reason)); setReady(true); });
  }, []);
  const persist = async () => {
    if (saving.current) await saving.current;
    const item = current.current;
    if (!item.hasWork || (item.fingerprint === lastSaved.current && item.navigation === lastNavigation.current)) return;
    const operation = item.fingerprint === lastSaved.current
      ? saveDraft(job.current.id, job.current.revision, item.title, item.snapshot,'jobs',false)
      : saveDraft(job.current.id, job.current.revision, item.title, item.snapshot);
    saving.current = operation;
    try {
      const stored = await operation;
      job.current.revision = stored.revision;
      lastSaved.current = item.fingerprint;
      lastNavigation.current = item.navigation;
      setSavedAt(stored.updatedAt);
      setDirty(current.current.fingerprint !== item.fingerprint || current.current.navigation !== item.navigation);
      setError('');
    } finally { if (saving.current === operation) saving.current = null; }
  };
  const persistRef = useRef(persist);
  useEffect(() => { persistRef.current = persist; });
  useEffect(() => {
    if (!ready || chooser || !hasWork || (fingerprint === lastSaved.current && navigation === lastNavigation.current)) return;
    setDirty(true);
    const timer = setTimeout(() => { void persistRef.current().catch((reason) => setError(String(reason?.message ?? reason))); }, 900);
    return () => clearTimeout(timer);
  }, [fingerprint, navigation, ready, chooser, hasWork]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty && hasWork) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, hasWork]);
  const preserveBeforeSwitch = async () => {
    if(!await pending.confirm())throw new Error('현재 편집을 유지합니다.');
    if (!ready || !current.current.hasWork) return;
    try { await persistRef.current(); }
    catch (reason) {
      if (!window.confirm(`${String((reason as Error).message)}\n현재 입력을 별도 백업 파일로 내려받고 계속할까요? 저장된 원본은 덮어쓰지 않습니다.`)) throw reason;
      downloadLocalBlob(await packArchive(current.current.snapshot), `${current.current.title || 'UWS-report'}-recovery.uws-report.zip`);
    }
  };
  const openSaved = async (id: string, previous = false) => {
    setBusy(true);
    try {
      await preserveBeforeSwitch();
      const stored = await getDraft(id);
      if (!stored) throw new Error('저장한 작업이 없습니다.');
      const value = previous ? stored.previous : stored.value;
      if (!value) throw new Error('이전 저장본이 없습니다.');
      onRestore(value);
      job.current = { id: stored.id, revision: stored.revision };
      lastSaved.current = previous ? null : snapshotFingerprint(value);
      lastNavigation.current = navigationFingerprint(value);
      setSavedAt(stored.updatedAt); setReady(true); setChooser(false); setError('');
    } catch (reason) { setError(String((reason as Error).message)); }
    finally { setBusy(false); }
  };
  const newJob = async () => {
    if (ready && hasWork && !window.confirm('현재 작업을 저장하고 새 보고서를 시작할까요?')) return;
    setBusy(true);
    try {
      await preserveBeforeSwitch();
      job.current = { id: crypto.randomUUID(), revision: 0 }; lastSaved.current = null;
      onNew(); setSavedAt(null); setReady(true); setChooser(false); setError(''); setDirty(false);
    } catch (reason) { setError(String((reason as Error).message)); }
    finally { setBusy(false); }
  };
  const backup = async () => {
    setBusy(true);
    try { downloadLocalBlob(await packArchive(current.current.snapshot), `${title.replace(/[<>:"/\\|?*]/g, '_') || 'UWS-report'}.uws-report.zip`); setError(''); setBackupMessage('사진 원본과 입력값이 포함된 작업 파일 다운로드를 시작했습니다. 파일 저장 완료를 확인하세요.'); }
    catch (reason) { setError(String((reason as Error).message)); }
    finally { setBusy(false); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const value = await unpackArchive(file);
      if (hasWork && !window.confirm('현재 작업을 저장하고 백업 파일을 새 작업으로 열까요?')) return;
      await preserveBeforeSwitch();
      onRestore(value);
      job.current = { id: crypto.randomUUID(), revision: 0 }; lastSaved.current = null;
      setReady(true); setChooser(false); setError(''); setSavedAt(null);
    } catch (reason) { setError(String((reason as Error).message)); }
    finally { setBusy(false); }
  };
  return <section className="draft-toolbar" aria-label="작업 저장과 복원">
    <span role="status">{!ready ? '저장된 작업 확인' : error ? '자동 저장 확인 필요' : savedAt ? `마지막 저장 ${new Date(savedAt).toLocaleTimeString()}${dirty ? ' · 변경 저장 대기' : ''}` : '이 브라우저에 자동 저장'}</span>
    <button type="button" disabled={busy || !hasWork} onClick={() => void backup()}>작업 파일 저장</button>
    <button type="button" disabled={busy} onClick={() => input.current?.click()}>작업 파일 불러오기</button>
    <button type="button" disabled={busy} onClick={() => { void listDrafts().then((values) => { setHeaders(values); setChooser(true); }).catch((reason) => setError(String(reason.message))); }}>저장된 작업</button>
    <button type="button" disabled={busy} onClick={() => void newJob()}>새 보고서</button>
    <input type="file" accept=".zip" className="visually-hidden" aria-label="보고서 작업 파일" ref={input} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
    {error && <p role="alert">{error}<button type="button" disabled={busy} onClick={() => { void persistRef.current().catch((reason) => setError(String(reason.message))); }}>저장 다시 시도</button></p>}
    {backupMessage && <p role="status">{backupMessage}</p>}
    {chooser && <Modal label="저장된 보고서 이어서 작성" onClose={ready ? () => setChooser(false) : undefined}>
      <h3>저장된 보고서 이어서 작성</h3>
      <p>사진과 입력 내용은 이 브라우저에 저장됩니다. 중요한 작업은 파일로도 백업하세요.</p>
      {headers.map((item) => <div key={item.id}><strong>{item.title || '새 보고서'}</strong><span>{new Date(item.updatedAt).toLocaleString()}</span>
        <button type="button" disabled={busy} onClick={() => void openSaved(item.id)}>이어서 작성</button>
        <button type="button" disabled={busy} onClick={() => void openSaved(item.id, true)}>직전 저장본 복원</button>
      </div>)}
      {!headers.length && <p>저장된 작업이 없습니다.</p>}
      <button type="button" disabled={busy} onClick={() => void newJob()}>새 보고서 시작</button>
      {ready && <button type="button" onClick={() => setChooser(false)}>닫기</button>}
    </Modal>}
  </section>;
}
