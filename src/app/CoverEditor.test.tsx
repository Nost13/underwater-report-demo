import { fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverEditor } from './CoverEditor';
import { createCoverInfo, type CoverInfo } from './coverInfo';
import { emptyReportInfo } from './reportInfo';
import type { ReportSection } from '../domain/types';

const section: ReportSection = { id: 'rope', targetId: 'rope', area: 'NICHE', component: 'Rope', service: 'REMOVAL', phases: ['BEFORE', 'AFTER'], conditions: {} };
const info = emptyReportInfo();
info.vessel.name = 'VESSEL TEST';
info.vessel.jobNo = 'Us-2609';
function Harness({ initial = createCoverInfo() }: { initial?: CoverInfo }) {
  const [value, onChange] = useState(initial);
  return <><CoverEditor value={value} onChange={onChange} reportInfo={info} sections={[section]} onBack={() => {}} onNext={() => {}} onEditReportInfo={() => {}} /><output data-testid="state">{JSON.stringify(value)}</output></>;
}
const state = () => JSON.parse(screen.getByTestId('state').textContent!);
let active: Set<string>;
beforeEach(() => {
  active = new Set();
  let id = 0;
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => { const url = 'blob:cover-' + ++id; active.add(url); return url; });
    static revokeObjectURL = vi.fn((url: string) => active.delete(url));
  });
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Cover editor', () => {
  it('uses the measured Word hero frame aspect ratio for the interactive crop preview', () => {
    render(<Harness />);
    expect(screen.getByLabelText('사진 초점 조정')).toHaveStyle({ aspectRatio: '3026 / 1551' });
  });
  it('identifies Cover as the exact third workflow step', () => {
    render(<Harness />);

    expect(screen.getByText('STEP 03', { selector: '.step-kicker' })).toBeVisible();
  });

  it('selects, replaces and clears its own photo with no leaked URLs under StrictMode', () => {
    const view = render(<StrictMode><Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'first.jpg') }} /></StrictMode>);
    expect(active.size).toBe(1);
    const currentUrl = [...active][0];
    fireEvent.change(screen.getByLabelText('Date of Issue'), { target: { value: '2027-01-02' } });
    expect([...active]).toEqual([currentUrl]);
    expect(screen.getByAltText('표지 사진 미리보기')).toHaveAttribute('src', currentUrl);
    const picker = screen.getByLabelText('표지 사진');
    fireEvent.change(picker, { target: { files: [new File(['b'], 'second.jpg', { type: 'image/jpeg' })] } });
    expect(screen.getByAltText('표지 사진 미리보기')).toHaveAttribute('src', [...active][0]);
    expect(active.size).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '사진 비우기' }));
    expect(screen.queryByAltText('표지 사진 미리보기')).not.toBeInTheDocument();
    expect(active.size).toBe(0);
    fireEvent.change(picker, { target: { files: [new File(['c'], 'third.jpg', { type: 'image/jpeg' })] } });
    view.unmount();
    expect(active.size).toBe(0);
  });
  it('updates zoom and clamps pointer focus outside the fixed banner', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg') }} />);
    fireEvent.change(screen.getByLabelText('사진 확대'), { target: { value: '2' } });
    expect(state().crop.zoom).toBe(2);
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { clientX: 300, clientY: 200, button: 0 });
    fireEvent.pointerMove(banner, { clientX: 900, clientY: -100 });
    expect(state().crop).toEqual({ focusX: 1, focusY: 0, zoom: 2 });
    fireEvent.pointerUp(banner);
    fireEvent.pointerMove(banner, { clientX: 100, clientY: 300 });
    expect(state().crop.focusX).toBe(1);
  });
  it('keeps manual scope until explicit regeneration and edits issue date', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Scope of Work title'), { target: { value: 'Custom title' } });
    fireEvent.change(screen.getByLabelText('Scope of Work description'), { target: { value: 'Custom text' } });
    expect(state().scopeMode).toBe('MANUAL');
    fireEvent.change(screen.getByLabelText('Date of Issue'), { target: { value: '2026-09-04' } });
    expect(state().issueDate).toBe('2026-09-04');
    fireEvent.click(screen.getByRole('button', { name: '자동 내용 다시 적용' }));
    expect(state()).toMatchObject({ scopeMode: 'AUTO', scopeTitle: 'Removal of Rope', scopeDescription: 'Removal: Rope' });
  });
  it('positions the zoomed preview at the saved source rectangle including clamped edges', () => {
    render(<Harness initial={{ ...createCoverInfo(), photoFile: new File(['a'], 'photo.jpg'), crop: { focusX: .5, focusY: .5, zoom: 2 } }} />);
    const image = screen.getByAltText('표지 사진 미리보기');
    Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
    fireEvent.load(image);
    expect(image).toHaveStyle({ objectPosition: '50% 50%', transformOrigin: '50% 50%', transform: 'scale(2)' });
    const banner = screen.getByLabelText('사진 초점 조정');
    vi.spyOn(banner, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect);
    fireEvent.pointerDown(banner, { clientX: 400, clientY: 0, button: 0 });
    expect(image).toHaveStyle({ objectPosition: '100% 0%', transformOrigin: '100% 0%', transform: 'scale(2)' });
  });
  it('shows linked values and keeps a fixed A4 preview with blank missing metadata', () => {
    const edit = vi.fn();
    render(<CoverEditor value={createCoverInfo()} onChange={vi.fn()} reportInfo={info} sections={[]} onBack={vi.fn()} onNext={vi.fn()} onEditReportInfo={edit} />);
    const preview = screen.getByLabelText('A4 표지 미리보기');
    expect(within(preview).getByText('VESSEL TEST')).toBeVisible();
    expect(within(preview).getByText('Us-2609')).toBeVisible();
    expect(within(preview).getByText('IMO NUMBER').nextElementSibling).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'Report Information 수정' }));
    expect(edit).toHaveBeenCalledOnce();
  });
});
