import { useEffect, useState } from 'react';

const KEY = 'uws-photo-panel-v1';
const defaults = { columns: 1, width: 320 };
const minimumWidth = (columns:number) => [0,280,420,600,780][columns] ?? 280;
function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value && [1, 2, 3, 4].includes(value.columns) && Number.isFinite(value.width) && value.width >= 280 && value.width <= 1000) return {columns:value.columns as number,width:Math.max(minimumWidth(value.columns),value.width)};
  } catch { /* A browser preference must never block a report. */ }
  return defaults;
}
export function usePhotoPanelSettings() {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* Session-only fallback. */ } }, [settings]);
  return {
    ...settings,
    setColumns: (columns: number) => setSettings((previous) => ({ columns, width: Math.max(previous.width, [0, 320, 440, 640, 800][columns]) })),
    setWidth: (width: number) => setSettings((previous) => ({ ...previous, width:Math.max(minimumWidth(previous.columns),width) })),
  };
}
export function PhotoPanelSettings({ columns, width, setColumns, setWidth }: ReturnType<typeof usePhotoPanelSettings>) {
  return <div className="photo-panel-settings">
    <div role="group" aria-label="미배정 사진 배열">{[1, 2, 3, 4].map((count) => <button type="button" key={count} aria-label={`미배정 사진 ${count}열`} aria-pressed={columns === count} onClick={() => setColumns(count)}>{count}열</button>)}</div>
    <label>패널 너비 <input type="range" aria-label="미배정 사진 패널 너비" min={minimumWidth(columns)} max="1000" step="20" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
  </div>;
}
