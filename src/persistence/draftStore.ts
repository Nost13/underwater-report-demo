export interface DraftRecord { id: string; revision: number; updatedAt: number; title: string; value: unknown; previous?: unknown }
export type DraftHeader = Pick<DraftRecord, 'id' | 'revision' | 'updatedAt' | 'title'>;
const DB_NAME = 'uws-report-local-v1';

export function nextDraftRevision(prior: DraftRecord | undefined, id: string, expected: number, title: string, value: unknown, now = Date.now(), rotatePrevious = true): DraftRecord {
  if ((prior?.revision ?? 0) !== expected) throw new Error('다른 탭에서 이 작업을 변경했습니다. 저장된 작업을 다시 열거나 작업 파일로 백업하세요.');
  return { id, revision: expected + 1, updatedAt: now, title, value, ...(prior ? { previous: rotatePrevious ? prior.value : prior.previous } : {}) };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('이 브라우저에서는 자동 저장을 사용할 수 없습니다. 작업 파일로 저장하세요.')); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const store of ['jobs', 'layouts']) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('저장소를 사용하는 다른 탭을 닫은 뒤 다시 시도하세요.'));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listDrafts(storeName: 'jobs' | 'layouts' = 'jobs'): Promise<DraftHeader[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const headers: DraftHeader[] = [];
    const transaction = db.transaction(storeName, 'readonly');
    const cursor = transaction.objectStore(storeName).openCursor();
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      const { id, revision, title, updatedAt } = cursor.result.value as DraftRecord;
      headers.push({ id, revision, title, updatedAt });
      cursor.result.continue();
    };
    transaction.oncomplete = () => { db.close(); resolve(headers.sort((a, b) => b.updatedAt - a.updatedAt)); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function getDraft(id: string, storeName: 'jobs' | 'layouts' = 'jobs'): Promise<DraftRecord | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(id);
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

export async function saveDraft(id: string, expected: number, title: string, value: unknown, storeName: 'jobs' | 'layouts' = 'jobs', rotatePrevious = true): Promise<DraftRecord> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.get(id);
    let next: DraftRecord;
    let failure: unknown;
    request.onsuccess = () => {
      try { next = nextDraftRevision(request.result, id, expected, title, value, Date.now(), rotatePrevious); store.put(next); }
      catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => { db.close(); resolve(next); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(failure ?? transaction.error ?? new Error('자동 저장에 실패했습니다. 작업 파일을 저장하세요.')); };
  });
}
